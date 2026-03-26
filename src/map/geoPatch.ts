/**
 * Patches Natural Earth GeoJSON features to normalize ISO_A2 codes.
 *
 * Natural Earth uses ISO_A2 = "-99" for disputed/special territories.
 * Some have valid codes in ISO_A2_EH (France, Norway, Kosovo),
 * others need manual mapping (Somaliland → SO, N. Cyprus → CY, etc.).
 *
 * Patching at the source level ensures ALL layers (driving_side, future
 * enrichments) work correctly without per-layer fallback logic.
 */

/**
 * Manual mapping for territories where both ISO_A2 and ISO_A2_EH are "-99".
 * Maps ADM0_A3 (3-letter admin code) → ISO_A2 (2-letter country code)
 * of the de-facto governing or geographically relevant country.
 */
const DISPUTED_TO_ISO: Record<string, string> = {
  SOL: "SO", // Somaliland → Somalia
  CYN: "CY", // Northern Cyprus → Cyprus
  CNM: "CY", // Cyprus UN Buffer Zone → Cyprus
  ESB: "GB", // Dhekelia (UK base) → United Kingdom
  WSB: "GB", // Akrotiri (UK base) → United Kingdom
  USG: "US", // Guantanamo Bay → United States
  KAS: "IN", // Siachen Glacier → India
  SPI: "AR", // Southern Patagonian Ice Field → Argentina
};

export function patchCountryISOCodes(
  fc: GeoJSON.FeatureCollection<GeoJSON.Geometry>
) {
  for (const feature of fc.features) {
    const props = feature.properties;
    if (!props) continue;

    const iso = props.ISO_A2;
    if (iso && iso !== "-99" && iso !== "-1") continue;

    // First try ISO_A2_EH
    const eh = props.ISO_A2_EH;
    if (eh && eh !== "-99" && eh !== "-1") {
      props.ISO_A2 = eh;
      continue;
    }

    // Then try manual mapping by ADM0_A3
    const adm0 = props.ADM0_A3;
    if (adm0 && DISPUTED_TO_ISO[adm0]) {
      props.ISO_A2 = DISPUTED_TO_ISO[adm0];
    }
  }
}
