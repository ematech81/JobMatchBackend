const cron = require('node-cron');
const { cron: cronConfig } = require('../config/env');
const { searchJobsLive, cacheJobs } = require('../services/jsearchService');
const { runMatchingForAllUsers } = require('../services/matchingService');

/**
 * Scheduled pull: covers common titles x common countries in use on the platform,
 * caches results, then triggers matching for all users against the fresh cache.
 * Keeps JSearch usage low/predictable per Section 3.
 */
async function pullAndCacheJobs() {
  console.log('[Cron] Starting scheduled job pull...');
  let totalCached = 0;

  for (const country of cronConfig.commonCountries) {
    for (const title of cronConfig.commonTitles) {
      try {
        const jobs = await searchJobsLive({ query: title, country });
        await cacheJobs(jobs);
        totalCached += jobs.length;
        console.log(`[Cron] ${title} / ${country}: fetched ${jobs.length} jobs`);
      } catch (err) {
        console.error(`[Cron] Failed pulling ${title} / ${country}:`, err.message);
      }
    }
  }

  console.log(`[Cron] Pull complete. Total jobs processed: ${totalCached}`);

  try {
    const matchResults = await runMatchingForAllUsers();
    console.log('[Cron] Matching run complete:', matchResults.length, 'users processed');
  } catch (err) {
    console.error('[Cron] Matching run failed:', err.message);
  }
}

function startCronJobs() {
  cron.schedule(cronConfig.schedule, pullAndCacheJobs);
  console.log(`[Cron] Job pull scheduled: "${cronConfig.schedule}"`);
}

module.exports = { startCronJobs, pullAndCacheJobs };