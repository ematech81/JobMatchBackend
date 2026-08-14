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
const gated = [
  ['AFFINDA_API_KEY', 'resume upload parsing (Path A)'],
  ['AFFINDA_WORKSPACE', 'resume upload parsing (Path A) — the Affinda workspace to upload into'],
  ['AFFINDA_DOCUMENT_TYPE', 'resume upload parsing (Path A) — without it, extraction silently no-ops'],
  ['KORAPAY_SECRET_KEY', 'subscription checkout — korapayService stays stubbed without it'],
  ['BREVO_API_KEY', 'new-match email notifications — emailService stays stubbed without it']
];
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
    dataSource,
    // How long a cached Job stays servable before a country search refetches.
    // Slightly longer than the cron interval so scheduled pulls normally keep
    // the cache warm and this only fires for gaps the cron didn't cover.
    cacheTtlHours: Number(process.env.JOB_CACHE_TTL_HOURS || 6)
  },

  // Official Affinda API (not the RapidAPI marketplace listing) — a direct
  // account with a workspace configured for Resume document types.
  affinda: {
    apiKey: process.env.AFFINDA_API_KEY,
    workspace: process.env.AFFINDA_WORKSPACE,
    // Auto-classification silently no-ops (returns documentType: null and an
    // empty data object, no error) on plain/sparse documents — pinning this
    // explicitly is what actually makes extraction run.
    documentType: process.env.AFFINDA_DOCUMENT_TYPE,
    apiBase: process.env.AFFINDA_API_BASE || 'https://api.affinda.com'
  },

  claude: {
    apiKey: process.env.CLAUDE_API_KEY
  },

  // Absent secretKey means checkout is recorded locally (pending
  // Subscription row) but no real charge is ever initiated — see
  // korapayService.js.
  korapay: {
    secretKey: process.env.KORAPAY_SECRET_KEY,
    publicKey: process.env.KORAPAY_PUBLIC_KEY,
    baseUrl: process.env.KORAPAY_BASE_URL || 'https://api.korapay.com'
  },

  // Shared secret the korapay-webhook-router attaches as `x-router-secret`
  // to every request it forwards — proves an incoming webhook actually came
  // through the router, not a direct spoofed call. Must match the same
  // value configured on the router's own end (ROUTER_FORWARD_SECRET there).
  // Optional: if unset, this check is skipped and the KoraPay HMAC signature
  // (see korapayService.verifyWebhookSignature) is the sole check — still a
  // real, sufficient verification on its own.
  routerForwardSecret: process.env.ROUTER_FORWARD_SECRET,

  // Stubbed until a real key/verified sender exist — see emailService.js.
  // Absent key means notifyNewMatches logs and skips the send instead of
  // throwing; matching itself still runs and the socket/in-app notification
  // still fires either way.
  brevo: {
    apiKey: process.env.BREVO_API_KEY,
    senderEmail: process.env.BREVO_SENDER_EMAIL || 'notifications@jobmatch.com',
    senderName: process.env.BREVO_SENDER_NAME || 'JobMatch'
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