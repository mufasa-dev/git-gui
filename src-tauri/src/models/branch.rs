use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileContentResponse {
    pub is_image: bool,
    pub content: String,
    pub size: usize,
    pub line_count: Option<usize>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileMetadataResponse {
    pub is_binary: bool,
    pub size: usize,
}