const mongoose = require('mongoose');
const { mongoUri } = require('./env');

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 3000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Retries a handful of times before giving up — a transient Atlas blip or a
 * cold-start race with the platform's own network setup shouldn't mean a
 * full crash-and-restart cycle. Still exits after MAX_RETRIES; a genuinely
 * broken connection string or unreachable cluster should fail loudly, not
 * retry forever.
 */
const connectDB = async (attempt = 1) => {
  try {
    await mongoose.connect(mongoUri);
    console.log('[DB] MongoDB connected');
  } catch (err) {
    console.error(`[DB] Connection attempt ${attempt}/${MAX_RETRIES} failed:`, err.message);
    if (attempt >= MAX_RETRIES) {
      console.error('[DB] Giving up after', MAX_RETRIES, 'attempts.');
      process.exit(1);
    }
    await sleep(RETRY_DELAY_MS);
    return connectDB(attempt + 1);
  }
};

module.exports = connectDB;
