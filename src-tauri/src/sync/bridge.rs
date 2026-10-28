use crate::sync::store::append_missing;
use crate::sync::store_types::{DomainEvent, EventMetadata};
use crate::vault;
use tauri::AppHandle;

/* ------------------------------------------------------------------ */
/* Puente entre la bóveda de la UI y el store de sincronización      */
/* ------------------------------------------------------------------ */

/**
 * Copia los eventos de la bóveda al store append-only que usa el protocolo
 * P2P. La bóveda es la fuente de verdad de la UI (JSONL por dispositivo); el
 * store de sync es la vista reconciliable por dominio.
 */
pub fn export_vault_to_store(app: &AppHandle, root: &str) -> Result<usize, String> {
    let events = match vault::read_events(app) {
        Ok(events) => events,
        // En modo navegador/headless puede no haber bóveda todavía.
        Err(_) => return Ok(0),
    };
    if events.is_empty() {
        return Ok(0);
    }
    let domain_events: Vec<DomainEvent> = events
        .into_iter()
        .map(|event| {
            let timestamp = parse_ts(&event.timestamp);
            DomainEvent {
                id: event.id,
                type_: event.kind,
                payload: event.payload,
                metadata: EventMetadata {
                    hlc: timestamp,
                    device_id: event.device_id,
                    timestamp,
                    version: 1,
                },
            }
        })
        .collect();
    append_missing(root, "events", &domain_events)
}

/**
 * Importa a la bóveda los eventos que llegaron por sync y que aún no estaban.
 * Devuelve cuántos eventos nuevos se escribieron.
 */
pub fn import_store_to_vault(app: &AppHandle, root: &str) -> Result<usize, String> {
    let domain_events = crate::sync::store::load_domain(root, "events")?;
    if domain_events.is_empty() {
        return Ok(0);
    }
    let existing = vault::read_events(app).unwrap_or_default();
    let mut existing_ids: std::collections::BTreeSet<String> =
        existing.into_iter().map(|event| event.id).collect();
    let mut added = 0usize;
    for domain_event in domain_events {
        if existing_ids.contains(&domain_event.id) {
            continue;
        }
        let event = vault::Event {
            id: domain_event.id.clone(),
            device_id: domain_event.metadata.device_id.clone(),
            timestamp: format_ts(domain_event.metadata.timestamp),
            kind: domain_event.type_,
            payload: domain_event.payload,
        };
        if vault::append_event(app, &event).is_ok() {
            existing_ids.insert(domain_event.id);
            added += 1;
        }
    }
    Ok(added)
}

fn parse_ts(value: &str) -> u64 {
    chrono::DateTime::parse_from_rfc3339(value)
        .map(|date| date.timestamp_millis() as u64)
        .unwrap_or(0)
}

fn format_ts(ms: u64) -> String {
    if ms == 0 {
        return chrono::Utc::now().to_rfc3339();
    }
    chrono::DateTime::<chrono::Utc>::from_timestamp_millis(ms as i64)
        .map(|date| date.to_rfc3339())
        .unwrap_or_else(|| chrono::Utc::now().to_rfc3339())
}
