use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
pub struct RegionInfo {
    pub id: String,
    pub name: String,
    pub name_en: Option<String>,
    pub country_code: Option<String>,
    pub region_level: String,
    pub geometry_ref: Option<String>,
    pub anchor_lng: Option<f64>,
    pub anchor_lat: Option<f64>,
}

#[derive(Debug, Serialize)]
pub struct RegionStats {
    pub countries: usize,
    pub admin1: usize,
    pub total: usize,
}
