require('dotenv').config();

// Fail at boot rather than surfacing these as opaque 500s mid-request.
const REQUIRED = ['MONGO_URI', 'JWT_SECRET'];
const missing = REQUIRED.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`[Config] Missing required env vars: ${missing.join(', ')}`);
  process.exit(1);
}

const dataSource =
  process.env.JOB_DATA_SOURCE ||
  (process.env.NODE_ENV === 'production' ? 'live' : 'fixture');

if (!['live', 'fixture'].includes(dataSource)) {
  console.error(`[Config] JOB_DATA_SOURCE must be "live" or "fixture", got "${dataSource}"`);
  process.exit(1);
}

console.log(
  dataSource === 'fixture'
    ? '[Config] Job data source: FIXTURE (src/jobDummyData) — no JSearch quota used'
    : '[Config] Job data source: LIVE (JSearch API) — consumes quota'
);

// Feature-gating keys: absent/placeholder values disable a feature rather
// than the whole server, so warn loudly instead of exiting.
const PLACEHOLDER = /^(your_|replace_|changeme)/i;
const gated = [['AFFINDA_API_KEY', 'resume upload parsing (Path A)']];
if (dataSource === 'live') {
  gated.push(['JSEARCH_API_KEY', 'job search + scheduled pulls']);
}
for (const [key, feature] of gated) {
  const value = process.env[key];
  if (!value || PLACEHOLDER.test(value)) {
    console.warn(`[Config] ${key} is unset or a placeholder — ${feature} will fail.`);
  }
}

module.exports = {
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGO_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

  jsearch: {
    apiKey: process.env.JSEARCH_API_KEY,
    apiHost: process.env.JSEARCH_API_HOST,
    baseUrl: process.env.JSEARCH_BASE_URL,
    // 'fixture' serves src/jobDummyData/ instead of calling JSearch. Defaults
    // to fixture outside production so development can't quietly drain the
    // 200 req/month budget; set JOB_DATA_SOURCE=live to hit the real API.
    dataSource
  },

  affinda: {
    apiKey: process.env.AFFINDA_API_KEY,
    apiHost: process.env.AFFINDA_API_HOST,
    baseUrl: process.env.AFFINDA_BASE_URL
  },

  claude: {
    apiKey: process.env.CLAUDE_API_KEY
  },

  cron: {
    schedule: process.env.JOB_PULL_CRON || '0 */4 * * *',
    commonTitles: (process.env.COMMON_TITLES || 'software engineer')
      .split(',')
      .map(s => s.trim()),
    commonCountries: (process.env.COMMON_COUNTRIES || 'US')
      .split(',')
      .map(s => s.trim())
  },

  clientUrl: process.env.CLIENT_URL || 'http://localhost:3000'
};