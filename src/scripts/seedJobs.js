/**
 * Populates the Job cache on demand: `npm run seed`
 *
 * The cron pull (Section 3.1) only runs on its schedule, so a fresh database
 * has an empty cache for hours — nothing for the frontend to render. This runs
 * the same pull immediately.
 *
 * Honours JOB_DATA_SOURCE, so in the default fixture mode it seeds from
 * src/jobDummyData/ without touching the JSearch quota.
 */
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const { jsearch, cron: cronConfig } = require('../config/env');
const { searchJobsLive, cacheJobs } = require('../services/jsearchService');

async function seed() {
  await connectDB();

  if (jsearch.dataSource === 'live') {
    const calls = cronConfig.commonCountries.length * cronConfig.commonTitles.length;
    console.warn(
      `[Seed] LIVE mode: about to make ${calls} JSearch calls ` +
        `(monthly quota is 200). Set JOB_DATA_SOURCE=fixture to seed for free.`
    );
  }

  let cached = 0;
  let failed = 0;

  for (const country of cronConfig.commonCountries) {
    for (const title of cronConfig.commonTitles) {
      try {
        const raw = await searchJobsLive({ query: title, country });
        const jobs = await cacheJobs(raw);
        cached += jobs.length;
        console.log(`[Seed] ${title} / ${country}: ${jobs.length} jobs`);
      } catch (err) {
        failed += 1;
        console.error(`[Seed] FAILED ${title} / ${country}: ${err.message}`);
      }
    }
  }

  console.log(`[Seed] Done. ${cached} jobs upserted, ${failed} pulls failed.`);
  await mongoose.connection.close();
}

seed().catch(async (err) => {
  console.error('[Seed] Fatal:', err.message);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
