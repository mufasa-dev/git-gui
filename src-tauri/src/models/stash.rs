use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StashEntry {
    pub reference: String,
    pub commit: String,
    pub branch: String,
    pub message: String,
    pub created_at: String,
}
