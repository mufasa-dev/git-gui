use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TagEntry {
    pub name: String,
    pub target_commit: String,
    pub short_commit: String,
    pub kind: String,
    pub message: String,
    pub tagger: String,
    pub created_at: String,
}
