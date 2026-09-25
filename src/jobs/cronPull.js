const cron = require('node-cron');
const { cron: cronConfig, jsearch } = require('../config/env');
const { searchJobsLive, cacheJobs } = require('../services/jsearchService');
const { runMatchingForAllUsers } = require('../services/matchingService');
const Job = require('../models/Job');

/**
 * Scheduled pull: covers common titles x common countries in use on the platform,
 * caches results, then triggers matching for all users against the fresh cache.
 * Keeps JSearch usage low/predictable per Section 3.
 *
 * Country-level freshness gate (mirrors ensureFreshJobsForCountry): if this
 * country already has jobs cached within the TTL window, the whole country is
 * skipped for this run rather than re-pulling all commonTitles regardless.
 * Without this, every run re-fetched all 35 country x title combinations
 * unconditionally — at the default schedule that's ~210 live calls/day
 * against JSearch's 200/month quota, guaranteed to exhaust it in under a day.
 */
async function pullAndCacheJobs() {
  console.log('[Cron] Starting scheduled job pull...');
  let totalCached = 0;

  const freshCutoff = new Date(Date.now() - jsearch.cacheTtlHours * 60 * 60 * 1000);

  for (const country of cronConfig.commonCountries) {
    const freshCount = await Job.countDocuments({ country, fetched_at: { $gte: freshCutoff } });
    if (freshCount > 0) {
      console.log(`[Cron] ${country}: cache still fresh (${freshCount} jobs), skipping.`);
      continue;
    }

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