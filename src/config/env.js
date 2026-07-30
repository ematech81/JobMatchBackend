require('dotenv').config();

module.exports = {
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGO_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

  jsearch: {
    apiKey: process.env.JSEARCH_API_KEY,
    apiHost: process.env.JSEARCH_API_HOST,
    baseUrl: process.env.JSEARCH_BASE_URL
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