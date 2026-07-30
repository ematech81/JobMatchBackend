/**
 * JSearch's `country` param and the cached Job.country field both use ISO
 * 3166-1 alpha-2 codes (e.g. "US"), but the country search bar (Section 1.2
 * of the guide) accepts free text like "USA", "Nigeria", "UK". This maps
 * common name variants to codes so cache lookups and live calls line up.
 *
 * Not exhaustive — covers the platform's configured COMMON_COUNTRIES plus
 * common aliases. Unmatched input passes through uppercased so the API call
 * still gets something reasonable rather than failing outright.
 */
const NAME_TO_CODE = {
  usa: 'US',
  'united states': 'US',
  'united states of america': 'US',
  us: 'US',
  uk: 'GB',
  'united kingdom': 'GB',
  gb: 'GB',
  britain: 'GB',
  nigeria: 'NG',
  ng: 'NG',
  canada: 'CA',
  ca: 'CA',
  germany: 'DE',
  de: 'DE',
  'south africa': 'ZA',
  za: 'ZA',
  kenya: 'KE',
  ke: 'KE',
  ghana: 'GH',
  gh: 'GH',
  india: 'IN',
  in: 'IN',
  australia: 'AU',
  au: 'AU',
  france: 'FR',
  fr: 'FR',
  ireland: 'IE',
  ie: 'IE',
  'new zealand': 'NZ',
  nz: 'NZ'
};

function normalizeCountryToCode(input = '') {
  const key = input.trim().toLowerCase();
  if (!key) return '';
  if (NAME_TO_CODE[key]) return NAME_TO_CODE[key];
  // Already looks like an ISO alpha-2 code
  if (key.length === 2) return key.toUpperCase();
  return input.trim().toUpperCase();
}

module.exports = { normalizeCountryToCode };
