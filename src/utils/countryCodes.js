/**
 * JSearch's `country` param and the cached Job.country field both use ISO
 * 3166-1 alpha-2 codes (e.g. "US"), but the country search bar (Section 1.2
 * of the guide) accepts free text like "USA", "Nigeria", "UK". This maps
 * name variants to codes so cache lookups and live calls line up.
 *
 * Returns '' for input it cannot resolve, so callers can reject with a 400
 * instead of spending a JSearch request on an unusable country param —
 * quota is the platform's tightest constraint (Section 3).
 */
const NAME_TO_CODE = {
  argentina: 'AR',
  australia: 'AU',
  austria: 'AT',
  bangladesh: 'BD',
  belgium: 'BE',
  brazil: 'BR',
  canada: 'CA',
  chile: 'CL',
  china: 'CN',
  colombia: 'CO',
  denmark: 'DK',
  egypt: 'EG',
  ethiopia: 'ET',
  finland: 'FI',
  france: 'FR',
  germany: 'DE',
  ghana: 'GH',
  greece: 'GR',
  'hong kong': 'HK',
  hungary: 'HU',
  india: 'IN',
  indonesia: 'ID',
  ireland: 'IE',
  israel: 'IL',
  italy: 'IT',
  japan: 'JP',
  jordan: 'JO',
  kenya: 'KE',
  malaysia: 'MY',
  mexico: 'MX',
  morocco: 'MA',
  netherlands: 'NL',
  holland: 'NL',
  'new zealand': 'NZ',
  nigeria: 'NG',
  norway: 'NO',
  pakistan: 'PK',
  peru: 'PE',
  philippines: 'PH',
  poland: 'PL',
  portugal: 'PT',
  qatar: 'QA',
  romania: 'RO',
  rwanda: 'RW',
  'saudi arabia': 'SA',
  senegal: 'SN',
  singapore: 'SG',
  'south africa': 'ZA',
  'south korea': 'KR',
  korea: 'KR',
  spain: 'ES',
  sweden: 'SE',
  switzerland: 'CH',
  tanzania: 'TZ',
  thailand: 'TH',
  tunisia: 'TN',
  turkey: 'TR',
  uganda: 'UG',
  ukraine: 'UA',
  'united arab emirates': 'AE',
  uae: 'AE',
  'united kingdom': 'GB',
  uk: 'GB',
  britain: 'GB',
  'great britain': 'GB',
  england: 'GB',
  'united states': 'US',
  'united states of america': 'US',
  usa: 'US',
  america: 'US',
  vietnam: 'VN',
  zambia: 'ZM',
  zimbabwe: 'ZW'
};

const VALID_CODES = new Set(Object.values(NAME_TO_CODE));

function normalizeCountryToCode(input = '') {
  const key = String(input).trim().toLowerCase();
  if (!key) return '';
  if (NAME_TO_CODE[key]) return NAME_TO_CODE[key];

  const upper = key.toUpperCase();
  if (key.length === 2 && VALID_CODES.has(upper)) return upper;

  return '';
}

module.exports = { normalizeCountryToCode };
