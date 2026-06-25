'use strict';
// Controlled-vocabulary coercers for Canopy's constrained fields
// Each returns { value, status: 'exact'|'coerced'|'unmatched', note }

// ── States ───────────────────────────────────────────────────────────────────
CC.STATE_MAP = {
  'alabama':'AL','alaska':'AK','arizona':'AZ','arkansas':'AR','california':'CA',
  'colorado':'CO','connecticut':'CT','delaware':'DE','florida':'FL','georgia':'GA',
  'hawaii':'HI','idaho':'ID','illinois':'IL','indiana':'IN','iowa':'IA',
  'kansas':'KS','kentucky':'KY','louisiana':'LA','maine':'ME','maryland':'MD',
  'massachusetts':'MA','michigan':'MI','minnesota':'MN','mississippi':'MS','missouri':'MO',
  'montana':'MT','nebraska':'NE','nevada':'NV','new hampshire':'NH','new jersey':'NJ',
  'new mexico':'NM','new york':'NY','north carolina':'NC','north dakota':'ND','ohio':'OH',
  'oklahoma':'OK','oregon':'OR','pennsylvania':'PA','rhode island':'RI','south carolina':'SC',
  'south dakota':'SD','tennessee':'TN','texas':'TX','utah':'UT','vermont':'VT',
  'virginia':'VA','washington':'WA','west virginia':'WV','wisconsin':'WI','wyoming':'WY',
  'district of columbia':'DC','washington dc':'DC','washington d.c.':'DC',
  'puerto rico':'PR','guam':'GU','virgin islands':'VI','american samoa':'AS',
  'northern mariana islands':'MP',
};
CC.STATE_CODES = new Set(['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID',
  'IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV',
  'NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT',
  'VT','VA','WA','WV','WI','WY','DC','PR','GU','VI','AS','MP']);

CC.coerceState = (v) => {
  if (!v || !v.trim()) return { value: '', status: 'exact', note: '' };
  const t = v.trim();
  if (CC.STATE_CODES.has(t.toUpperCase())) return { value: t.toUpperCase(), status: 'exact', note: '' };
  const code = CC.STATE_MAP[t.toLowerCase()];
  if (code) return { value: code, status: 'coerced', note: `"${t}" → ${code}` };
  return { value: t, status: 'unmatched', note: `State "${t}" not recognized` };
};

// ── Active ───────────────────────────────────────────────────────────────────
const ACTIVE_TRUE = new Set(['y','yes','t','true','active','x','1']);

CC.coerceActive = (v) => {
  if (!v || !v.trim()) return { value: 'Active', status: 'exact', note: '' };
  const lo = v.trim().toLowerCase();
  if (ACTIVE_TRUE.has(lo)) {
    const exact = lo === 'active';
    return { value: 'Active', status: exact ? 'exact' : 'coerced', note: exact ? '' : `"${v}" → Active` };
  }
  return { value: 'Inactive', status: 'coerced', note: `"${v}" → Inactive` };
};

// ── Business Type ────────────────────────────────────────────────────────────
CC.BIZ_TYPES = ['C-Corporation','S-Corporation','LLC','LLC-M','LLC-S','Partnership',
  'Sole Proprietorship','Estate','Trust','Non-Profit','Other'];

const BIZ_SYNONYMS = {
  'ccorporation':'C-Corporation','ccorp':'C-Corporation','c corp':'C-Corporation','c-corp':'C-Corporation',
  'scorporation':'S-Corporation','scorp':'S-Corporation','s corp':'S-Corporation','s-corp':'S-Corporation',
  'llcm':'LLC-M','llc-m':'LLC-M','llcs':'LLC-S','llc-s':'LLC-S',
  'soleprop':'Sole Proprietorship','sole prop':'Sole Proprietorship',
  'soleproprietorship':'Sole Proprietorship','sole proprietorship':'Sole Proprietorship',
  'nonprofit':'Non-Profit','non profit':'Non-Profit','501c3':'Non-Profit',
  'notforprofit':'Non-Profit','not for profit':'Non-Profit','nfp':'Non-Profit',
};

CC.coerceBizType = (v) => {
  if (!v || !v.trim()) return { value: '', status: 'exact', note: '' };
  const t = v.trim();
  const exact = CC.BIZ_TYPES.find(b => b.toLowerCase() === t.toLowerCase());
  if (exact) return { value: exact, status: t === exact ? 'exact' : 'coerced', note: t !== exact ? `"${t}" → ${exact}` : '' };
  const lo = t.toLowerCase();
  const norm = lo.replace(/[^a-z0-9 ]/g, '');
  if (BIZ_SYNONYMS[lo]) return { value: BIZ_SYNONYMS[lo], status: 'coerced', note: `"${t}" → ${BIZ_SYNONYMS[lo]}` };
  if (BIZ_SYNONYMS[norm]) return { value: BIZ_SYNONYMS[norm], status: 'coerced', note: `"${t}" → ${BIZ_SYNONYMS[norm]}` };
  return { value: 'Other', status: 'unmatched', note: `Business type "${t}" not recognized → Other` };
};

// ── Industry ─────────────────────────────────────────────────────────────────
CC.INDUSTRIES = [
  'Administrative & Support','Agriculture','Apparel','Arts','Chemicals','Construction',
  'Education','Electronics','Energy','Engineering','Entertainment','Finance','Fishing',
  'Food Services','Forestry','Fuel Dealer','Government','HVAC','Health Care','Hospitality',
  'Hunting','Information Technology','Insurance','Investment Holding','Landscape',
  'Management','Manufacturing','Media','Mining','Other','Pharmaceuticals','Plumbing',
  'Pool Services','Professional Services','Real Estate','Recreation',
  'Remediation Services','Rental & Leasing','Retail Trade','Scientific Services',
  'Shipping','Social Assistance','Tan & Spa Services','Technical Services',
  'Transportation','Utilities','Warehousing','Waste Management','Wholesale Food',
  'Wholesale Trade',
];

CC.coerceIndustry = (v) => {
  if (!v || !v.trim()) return { value: '', status: 'exact', note: '' };
  const t = v.trim();
  const match = CC.INDUSTRIES.find(i => i.toLowerCase() === t.toLowerCase());
  if (match) return { value: match, status: match === t ? 'exact' : 'coerced', note: match !== t ? `"${t}" → ${match}` : '' };
  return { value: 'Other', status: 'unmatched', note: `Industry "${t}" not recognized → Other` };
};

// ── Date normalizer ──────────────────────────────────────────────────────────
CC.normalizeDate = (v) => {
  if (!v || !v.trim()) return { value: '', status: 'exact', note: '' };
  const t = v.trim();
  // Already MM-DD-YYYY or MM/DD/YYYY
  if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/.test(t)) {
    const norm = t.replace(/\//g, '-');
    return { value: norm, status: 'coerced', note: norm !== t ? `"${t}" → ${norm}` : '' };
  }
  // M/D/YY
  if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2}$/.test(t)) {
    const parts = t.split(/[\/\-]/);
    const yr = parseInt(parts[2]);
    const fullYr = yr < 30 ? 2000 + yr : 1900 + yr;
    const norm = `${parts[0].padStart(2,'0')}-${parts[1].padStart(2,'0')}-${fullYr}`;
    return { value: norm, status: 'coerced', note: `"${t}" → ${norm}` };
  }
  // YYYY-MM-DD → convert to MM-DD-YYYY
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    const [y,m,d] = t.split('-');
    const norm = `${m}-${d}-${y}`;
    return { value: norm, status: 'coerced', note: `"${t}" → ${norm}` };
  }
  return { value: t, status: 'unmatched', note: `Date "${t}" not in a recognized format` };
};

// ── Phone normalizer ─────────────────────────────────────────────────────────
CC.normalizePhone = (v) => {
  if (!v || !v.trim()) return { value: '', status: 'exact', note: '' };
  const digits = v.replace(/\D/g, '');
  if (digits.length === 10) {
    const norm = `${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6)}`;
    return { value: norm, status: 'coerced', note: v.trim() !== norm ? `"${v}" → ${norm}` : '' };
  }
  if (digits.length === 11 && digits[0] === '1') {
    const norm = `${digits.slice(1,4)}-${digits.slice(4,7)}-${digits.slice(7)}`;
    return { value: norm, status: 'coerced', note: `"${v}" → ${norm}` };
  }
  return { value: v.trim(), status: 'unmatched', note: `Phone "${v}" not coercible to xxx-xxx-xxxx` };
};

// ── SSN normalizer ───────────────────────────────────────────────────────────
CC.normalizeSSN = (v) => {
  if (!v || !v.trim()) return { value: '', status: 'exact', note: '' };
  const digits = v.replace(/\D/g, '');
  if (digits.length !== 9) return { value: v.trim(), status: 'unmatched', note: `SSN "${v}" must be 9 digits` };
  const norm = `${digits.slice(0,3)}-${digits.slice(3,5)}-${digits.slice(5)}`;
  return { value: norm, status: v.trim() === norm ? 'exact' : 'coerced', note: v.trim() !== norm ? `"${v}" → ${norm}` : '' };
};

// ── EIN normalizer ───────────────────────────────────────────────────────────
CC.normalizeEIN = (v) => {
  if (!v || !v.trim()) return { value: '', status: 'exact', note: '' };
  const digits = v.replace(/\D/g, '');
  if (digits.length !== 9) return { value: v.trim(), status: 'unmatched', note: `EIN "${v}" must be 9 digits` };
  const norm = `${digits.slice(0,2)}-${digits.slice(2)}`;
  return { value: norm, status: v.trim() === norm ? 'exact' : 'coerced', note: v.trim() !== norm ? `"${v}" → ${norm}` : '' };
};

// ── ZIP prefix → state (US 50 states + DC; territories omitted) ───────────────
// Each entry: [loPrefix, hiPrefix, stateCode] — prefix = first 3 digits of ZIP.
// Ranges sourced from USPS ZIP assignment geography.
CC.ZIP_RANGES = [
  [  1,  27,'MA'],[  28,  29,'RI'],[  30,  38,'NH'],[  39,  49,'ME'],
  [ 50,  59,'VT'],[ 60,  69,'CT'],[ 70,  89,'NJ'],[ 100, 149,'NY'],
  [150, 196,'PA'],[197, 199,'DE'],[200, 205,'DC'],[206, 212,'MD'],
  [214, 219,'MD'],[220, 246,'VA'],[247, 268,'WV'],[270, 289,'NC'],
  [290, 299,'SC'],[300, 319,'GA'],[320, 349,'FL'],[350, 369,'AL'],
  [370, 385,'TN'],[386, 397,'MS'],[398, 399,'GA'],[400, 427,'KY'],
  [430, 458,'OH'],[460, 479,'IN'],[480, 499,'MI'],[500, 528,'IA'],
  [530, 549,'WI'],[550, 568,'MN'],[570, 577,'SD'],[580, 589,'ND'],
  [590, 599,'MT'],[600, 629,'IL'],[630, 658,'MO'],[660, 679,'KS'],
  [680, 693,'NE'],[700, 714,'LA'],[716, 729,'AR'],[730, 749,'OK'],
  [750, 799,'TX'],[800, 816,'CO'],[820, 831,'WY'],[832, 838,'ID'],
  [840, 847,'UT'],[850, 865,'AZ'],[870, 884,'NM'],[885, 885,'TX'],
  [889, 898,'NV'],[900, 961,'CA'],[967, 968,'HI'],[970, 979,'OR'],
  [980, 994,'WA'],[995, 999,'AK'],
];

// Returns the expected 2-letter state code for a given ZIP, or null if unknown/territory.
CC.getExpectedStateFromZIP = (zip) => {
  if (!zip || !zip.trim()) return null;
  const digits = zip.replace(/\D/g, '');
  if (digits.length < 5) return null;
  const prefix = parseInt(digits.slice(0, 3), 10);
  const entry = CC.ZIP_RANGES.find(([lo, hi]) => prefix >= lo && prefix <= hi);
  return entry ? entry[2] : null;
};
