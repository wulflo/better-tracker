use better_tracker_lib::vault::Event;
use std::time::Instant;
// Benchmark placeholder: measures serialization cost of 10k events.
fn main() {
    let start = Instant::now();
    let mut events = Vec::new();
    for i in 0..10000 {
        events.push(Event {
            id: format!("e{}", i),
            device_id: "dev".into(),
            timestamp: format!("2026-01-01T00:00:{:02}Z", i % 60),
            kind: "exercise.upsert".into(),
            payload: serde_json::json!({"id": i, "name": "ex"}),
        });
    }
    let ser = serde_json::to_string(&events).unwrap();
    let t1 = start.elapsed();
    let _: Vec<Event> = serde_json::from_str(&ser).unwrap();
    let t2 = start.elapsed();
    println!("serialize 10k events: {:?}", t1);
    println!("deserialize 10k events: {:?}", t2);
}