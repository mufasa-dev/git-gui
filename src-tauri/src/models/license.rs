use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LicenseDetails {
    pub has_access: bool,
    pub status: String,
    pub message: String,
    pub trial_ends_at: String,
    pub subscription_ends_at: String,
    pub is_expired: bool,
}