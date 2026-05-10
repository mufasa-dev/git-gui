use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CoverageStats {
    pub code_files: usize,
    pub test_files: usize,
    pub other_files: usize,
    pub percent: f64,
}

#[derive(serde::Serialize)]
pub struct FileHotspot {
    pub name: String,
    pub count: usize,
}