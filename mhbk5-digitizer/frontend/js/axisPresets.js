/* Common axis titles, ranked by how often they actually appear across the
 * existing KasperCalc MIL-HDBK-5 chapter pages (Chapter2.x/3.x/4.x *.html —
 * counted by grepping their Chart.js xLabel/yLabel strings). Each preset
 * fills both the axis "Label" and "Units" fields in one click, since the
 * editor keeps those as separate inputs. Order here is most-common first. */

const COMMON_AXIS_PRESETS = [
  { label: "Temperature", units: "°F" },
  { label: "Stress", units: "ksi" },
  { label: "Strain", units: "0.001 in./in." },
  { label: "Fatigue Life", units: "Cycles" },
  { label: "Maximum Stress", units: "ksi" },
  { label: "Compressive Tangent Modulus", units: "10³ ksi" },
  { label: "Strength", units: "ksi" },
  { label: "α (Coefficient of Thermal Expansion)", units: "10⁻⁶ in./in./°F" },
  { label: "Fsu", units: "ksi" },
  { label: "Strain", units: "in./in." },
  { label: "K (Thermal Conductivity)", units: "Btu/[(hr)(ft²)(°F)/ft]" },
  { label: "Percentage of Room-Temperature Strength", units: "%" },
  { label: "Percentage of Room-Temperature Modulus", units: "%" },
  { label: "Shear Strength", units: "ksi" },
  { label: "Compressive Stress", units: "ksi" },
  { label: "Reduction of Area", units: "%" },
  { label: "Elongation", units: "%" },
  { label: "C (Specific Heat)", units: "Btu/(lb)(°F)" },
  { label: "Maximum Principal Stress", units: "ksi" },
  { label: "Fbru", units: "ksi" },
  { label: "L/D", units: "" },
  { label: "D/t", units: "" },
];

/* ---------- Recently-used axis titles (localStorage, this browser only) ---------- */

const RECENT_AXIS_TITLES_KEY = "mhbk5_recent_axis_titles";
const MAX_RECENT_AXIS_TITLES = 15;

function getRecentAxisTitles() {
  try {
    const raw = localStorage.getItem(RECENT_AXIS_TITLES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function addRecentAxisTitle({ label, units }) {
  const trimmedLabel = (label || "").trim();
  if (!trimmedLabel) return;
  const trimmedUnits = (units || "").trim();

  const existing = getRecentAxisTitles().filter(
    (t) => !(t.label.toLowerCase() === trimmedLabel.toLowerCase() && t.units.toLowerCase() === trimmedUnits.toLowerCase())
  );
  existing.unshift({ label: trimmedLabel, units: trimmedUnits });
  const capped = existing.slice(0, MAX_RECENT_AXIS_TITLES);

  try {
    localStorage.setItem(RECENT_AXIS_TITLES_KEY, JSON.stringify(capped));
  } catch (e) {
    /* localStorage unavailable (e.g. private mode quota) — quick-pick just
     * won't have recents this session, not worth surfacing an error for. */
  }
}
