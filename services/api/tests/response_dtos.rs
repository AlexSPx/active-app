use active_api::responses::*;
use serde::{Serialize, de::DeserializeOwned};
use serde_json::{Map, Value};

fn fixture<T: DeserializeOwned + Serialize>(
    source: &Map<String, Value>,
    output: &mut Map<String, Value>,
    id: &str,
) {
    let value = &source[id];
    let dto: T = serde_json::from_value(value.clone()).unwrap_or_else(|e| panic!("{id}: {e}"));
    let serialized = serde_json::to_value(dto).unwrap();
    output.insert(id.to_owned(), serialized);
}

#[test]
fn serialize_response_dtos() {
    let source: Map<String, Value> =
        serde_json::from_str(include_str!("response-fixtures.json")).unwrap();
    let mut output = Map::new();
    macro_rules! fixtures { ($ty:ty: $($id:literal),+ $(,)?) => { $(fixture::<$ty>(&source, &mut output, $id);)+ }; }
    fixtures!(Profile: "profile.get", "profile.update");
    fixtures!(DeletedProfile: "profile.delete");
    fixtures!(String: "legal.terms", "legal.privacy");
    fixtures!(Catalog: "catalog.get");
    fixtures!(Vec<Exercise>: "catalog.search");
    fixtures!(Vec<ProgressionLog>: "progression.logs");
    fixtures!(Vec<Workout>: "workout.list");
    fixtures!(Workout: "workout.create", "workout.update");
    fixtures!(DeletedWorkout: "workout.delete");
    fixtures!(Vec<Routine>: "routine.list");
    fixtures!(Routine: "routine.get", "routine.active", "routine.create", "routine.update");
    fixtures!(DeletedRoutine: "routine.delete");
    fixtures!(HistoryRevision: "history.revision");
    fixtures!(Vec<Record>: "record.list");
    fixtures!(CreatedRecord: "record.create");
    fixtures!(DeletedRecord: "record.delete");
    fixtures!(Snapshot: "snapshot.get", "snapshot.put");
    fixtures!(Preferences: "preferences.get", "preferences.put");
    assert_eq!(source.len(), output.len());
    if let Ok(dir) = std::env::var("ACTIVE_CONTRACT_FIXTURES") {
        std::fs::write(
            format!("{dir}/responses.json"),
            serde_json::to_vec(&output).unwrap(),
        )
        .unwrap();
    }
}
