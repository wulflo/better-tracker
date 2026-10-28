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
    let barcode = code.trim().replace(char::is_whitespace, "");
    let variants = barcode_variants(&barcode);
    if variants.is_empty() {
        return Err("El código debe tener entre 6 y 14 dígitos (EAN/UPC).".into());
    }

    let client = reqwest::Client::builder()
        .timeout(TIMEOUT)
        .user_agent(concat!(
            "BetterTracker/",
            env!("CARGO_PKG_VERSION"),
            " (+https://github.com/wulflo/better-tracker)"
        ))
        .build()
        .map_err(|e| format!("No se pudo crear el cliente HTTP: {e}"))?;

    let mut last_error: Option<String> = None;
    for candidate in variants {
        match fetch_product(&client, &candidate).await {
            Ok(Some(product)) => {
                if let Some(product) = product_for_barcode(&product, &barcode) {
                    return Ok(Some(product));
                }
            }
            Ok(None) => continue,
            Err(error) => last_error = Some(error),
        }
    }

    match last_error {
        Some(error) => Err(error),
        None => Ok(None),
    }
}

/// El mismo producto puede aparecer como UPC-A de 12 dígitos, EAN-13 con cero
/// inicial o GTIN-14. Open Food Facts indexa una sola forma, así que probamos
/// las variantes antes de decir que el código no existe.
fn barcode_variants(code: &str) -> Vec<String> {
    let clean: String = code.chars().filter(|c| c.is_ascii_digit()).collect();
    if !(6..=14).contains(&clean.len()) {
        return Vec::new();
    }

    let mut variants = Vec::new();
    let candidates = [
        clean.clone(),
        clean.trim_start_matches('0').to_string(),
        format!("{clean:0>12}"),
        format!("{clean:0>13}"),
        format!("{clean:0>14}"),
    ];
    for candidate in candidates {
        if !candidate.is_empty() && !variants.contains(&candidate) {
            variants.push(candidate);
        }
    }
    variants
}

async fn fetch_product(client: &reqwest::Client, barcode: &str) -> Result<Option<Value>, String> {
    let url = format!(
        "{OFF_BASE}/{barcode}.json?fields=product_name,product_name_es,generic_name,brands,nutriments,categories_tags,quantity,serving_size"
    );
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
    match payload.get("product") {
        Some(product) if product.is_object() => Ok(Some(product.clone())),
        _ => Ok(None),
    }
}

fn product_for_barcode(product: &Value, barcode: &str) -> Option<Value> {
    let name = first_text(
        product,
        &["product_name_es", "product_name", "generic_name"],
    );
    let name = match name {
        Some(name) if !name.trim().is_empty() => name.trim().to_string(),
        _ => return None,
    };
    let brand = first_text(product, &["brands"]).unwrap_or_default();
    let display_name =
        if brand.trim().is_empty() || name.to_lowercase().contains(&brand.to_lowercase()) {
            name
        } else {
            format!("{name} ({brand})")
        };

    let nutriments = product.get("nutriments").unwrap_or(&Value::Null);
    let kcal = number(nutriments, &["energy-kcal_100g"])
        .or_else(|| number(nutriments, &["energy_100g"]).map(|kilojoules| kilojoules / 4.184))
        .unwrap_or(0.0);
    let protein = number(nutriments, &["proteins_100g"]).unwrap_or(0.0);
    let carbs = number(nutriments, &["carbohydrates_100g"]).unwrap_or(0.0);
    let fat = number(nutriments, &["fat_100g"]).unwrap_or(0.0);
    let fiber = number(nutriments, &["fiber_100g"]).unwrap_or(0.0);

    // Sin datos nutricionales no sirve para contar macros; preferimos que el
    // usuario cree el alimento manualmente con la etiqueta del envase.
    if kcal <= 0.0 && protein <= 0.0 && carbs <= 0.0 && fat <= 0.0 {
        return None;
    }

    let category = category_for(product);
    let quantity = first_text(product, &["quantity"]).unwrap_or_default();
    let serving = first_text(product, &["serving_size"]).unwrap_or_default();

    Some(json!({
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
    }))
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_upc_and_ean_variants() {
        let variants = barcode_variants("012345678905");
        assert!(variants.contains(&"012345678905".to_string()));
        assert!(variants.contains(&"12345678905".to_string()));
        assert!(variants.contains(&"0012345678905".to_string()));

        let ean = barcode_variants("8412345678905");
        assert!(ean.contains(&"8412345678905".to_string()));
        assert!(ean.contains(&"08412345678905".to_string()));
    }

    #[test]
    fn rejects_codes_that_are_not_ean_or_upc() {
        assert!(barcode_variants("123").is_empty());
        assert!(barcode_variants("no-es-un-codigo").is_empty());
    }

    #[test]
    fn keeps_the_scanned_code_in_the_product() {
        let product = json!({
            "product_name": "Producto",
            "brands": "Marca",
            "nutriments": { "energy-kcal_100g": 200, "proteins_100g": 10 },
        });
        let parsed = product_for_barcode(&product, "012345678905").unwrap();
        assert_eq!(parsed["barcode"], "012345678905");
        assert_eq!(parsed["id"], "off-012345678905");
        assert_eq!(parsed["name"], "Producto (Marca)");
    }

    #[test]
    fn ignores_products_without_macros() {
        let product = json!({ "product_name": "Agua", "nutriments": {} });
        assert!(product_for_barcode(&product, "012345678905").is_none());
    }
}
