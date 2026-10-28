use serde_json::{json, Value};
use std::time::Duration;

/* ------------------------------------------------------------------ */
/* Búsqueda de productos por código de barras (Open Food Facts)       */
/* ------------------------------------------------------------------ */

const OFF_BASE: &str = "https://world.openfoodfacts.org/api/v2/product";
const TIMEOUT: Duration = Duration::from_secs(12);

/**
 * Busca un producto por EAN/UPC en Open Food Facts.
 *
 * No descargamos una base de datos completa: se consulta bajo demanda y el
 * resultado se guarda como evento `food.saved` en la bóveda (lo hace el
 * frontend). Así el producto queda cacheado en `omega` y disponible sin red.
 */
#[tauri::command]
pub async fn lookup_barcode(code: String) -> Result<Option<Value>, String> {
    let barcode = code.trim().to_string();
    if !(6..=14).contains(&barcode.len()) || !barcode.chars().all(|c| c.is_ascii_digit()) {
        return Err("El código debe tener entre 6 y 14 dígitos (EAN/UPC).".into());
    }

    let url = format!(
        "{OFF_BASE}/{barcode}.json?fields=product_name,product_name_es,generic_name,brands,nutriments,categories_tags,quantity,serving_size"
    );
    let client = reqwest::Client::builder()
        .timeout(TIMEOUT)
        .user_agent(concat!(
            "BetterTracker/",
            env!("CARGO_PKG_VERSION"),
            " (+https://github.com/wulflo/better-tracker)"
        ))
        .build()
        .map_err(|e| format!("No se pudo crear el cliente HTTP: {e}"))?;

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("No se pudo consultar Open Food Facts: {e}"))?;

    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }
    if !response.status().is_success() {
        return Err(format!(
            "Open Food Facts respondió con estado {}.",
            response.status()
        ));
    }

    let payload: Value = response
        .json()
        .await
        .map_err(|e| format!("Respuesta inválida de Open Food Facts: {e}"))?;

    if payload.get("status").and_then(Value::as_i64) == Some(0) {
        return Ok(None);
    }
    let product = match payload.get("product") {
        Some(product) if product.is_object() => product,
        _ => return Ok(None),
    };

    let name = first_text(product, &["product_name_es", "product_name", "generic_name"]);
    let name = match name {
        Some(name) if !name.trim().is_empty() => name.trim().to_string(),
        _ => return Ok(None),
    };
    let brand = first_text(product, &["brands"]).unwrap_or_default();
    let display_name = if brand.trim().is_empty() || name.to_lowercase().contains(&brand.to_lowercase()) {
        name
    } else {
        format!("{name} ({brand})")
    };

    let nutriments = product.get("nutriments").unwrap_or(&Value::Null);
    let kcal = number(nutriments, &["energy-kcal_100g"])
        .or_else(|| {
            number(nutriments, &["energy_100g"]).map(|kilojoules| kilojoules / 4.184)
        })
        .unwrap_or(0.0);
    let protein = number(nutriments, &["proteins_100g"]).unwrap_or(0.0);
    let carbs = number(nutriments, &["carbohydrates_100g"]).unwrap_or(0.0);
    let fat = number(nutriments, &["fat_100g"]).unwrap_or(0.0);
    let fiber = number(nutriments, &["fiber_100g"]).unwrap_or(0.0);

    // Sin datos nutricionales no sirve para contar macros; preferimos que el
    // usuario cree el alimento manualmente con la etiqueta del envase.
    if kcal <= 0.0 && protein <= 0.0 && carbs <= 0.0 && fat <= 0.0 {
        return Ok(None);
    }

    let category = category_for(product);
    let quantity = first_text(product, &["quantity"]).unwrap_or_default();
    let serving = first_text(product, &["serving_size"]).unwrap_or_default();

    Ok(Some(json!({
        "id": format!("off-{barcode}"),
        "name": display_name,
        "category": category,
        "per100": {
            "kcal": round1(kcal),
            "protein": round1(protein),
            "carbs": round1(carbs),
            "fat": round1(fat),
            "fiber": round1(fiber),
        },
        "units": {},
        "custom": true,
        "barcode": barcode,
        "source": "openfoodfacts",
        "quantityLabel": if quantity.is_empty() { Value::Null } else { Value::String(quantity) },
        "servingLabel": if serving.is_empty() { Value::Null } else { Value::String(serving) },
    })))
}

fn first_text(product: &Value, keys: &[&str]) -> Option<String> {
    for key in keys {
        if let Some(text) = product.get(*key).and_then(Value::as_str) {
            let trimmed = text.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
    }
    None
}

fn number(value: &Value, keys: &[&str]) -> Option<f64> {
    for key in keys {
        match value.get(*key) {
            Some(Value::Number(number)) => {
                if let Some(number) = number.as_f64() {
                    if number.is_finite() && number >= 0.0 {
                        return Some(number);
                    }
                }
            }
            Some(Value::String(text)) => {
                if let Ok(number) = text.replace(',', ".").parse::<f64>() {
                    if number.is_finite() && number >= 0.0 {
                        return Some(number);
                    }
                }
            }
            _ => {}
        }
    }
    None
}

fn round1(value: f64) -> f64 {
    (value * 10.0).round() / 10.0
}

fn category_for(product: &Value) -> &'static str {
    let tags = product
        .get("categories_tags")
        .and_then(Value::as_array)
        .map(|tags| {
            tags.iter()
                .filter_map(Value::as_str)
                .map(|tag| tag.to_lowercase())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let has = |needle: &str| tags.iter().any(|tag| tag.contains(needle));

    if has("beverage") || has("drink") || has("water") || has("juice") || has("soda") {
        "bebida"
    } else if has("dairy") || has("milk") || has("cheese") || has("yogurt") {
        "lacteo"
    } else if has("meat") || has("poultry") || has("ham") || has("sausage") {
        "carne"
    } else if has("fish") || has("seafood") {
        "pescado"
    } else if has("egg") {
        "huevo"
    } else if has("fruit") {
        "fruta"
    } else if has("vegetable") || has("salad") {
        "verdura"
    } else if has("legume") || has("bean") {
        "legumbre"
    } else if has("bread") || has("cereal") || has("pasta") || has("rice") {
        "cereal"
    } else if has("nut") || has("seed") {
        "fruto_seco"
    } else if has("oil") || has("fat") || has("butter") {
        "grasa"
    } else if has("sauce") || has("condiment") || has("spice") {
        "condimento"
    } else if has("sweet") || has("snack") || has("chocolate") || has("dessert") {
        "dulce"
    } else if has("supplement") || has("protein") {
        "suplemento"
    } else {
        "procesado"
    }
}
