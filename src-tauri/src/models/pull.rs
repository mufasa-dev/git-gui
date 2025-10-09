use serde::Serialize;

#[derive(Serialize)]
pub struct GitPullResult {
    pub success: bool,
    pub message: String,
    pub needs_resolution: bool,
}