const axios = require('axios');
const { jsearch } = require('../config/env');
const Job = require('../models/Job');
const { normalizeCountryToCode } = require('../utils/countryCodes');

function mapJSearchResultToJob(raw) {
  return {
    job_id: raw.job_id,
    job_title: raw.job_title,
    employer_name: raw.employer_name,
    employer_logo: raw.employer_logo,
    employer_website: raw.employer_website,
    country: raw.job_country || raw.employer_country,
    job_city: raw.job_city,
    job_state: raw.job_state,
    job_employment_type: raw.job_employment_type,
    job_is_remote: raw.job_is_remote,
    apply_link: raw.job_apply_link,
    job_publisher: raw.job_publisher,
    job_description: raw.job_description,
    job_highlights: raw.job_highlights,
    job_min_salary: raw.job_min_salary,
    job_max_salary: raw.job_max_salary,
    job_salary_currency: raw.job_salary_currency,
    job_salary_period: raw.job_salary_period,
    job_posted_at: raw.job_posted_at_datetime_utc
      ? new Date(raw.job_posted_at_datetime_utc)
      : null,
    fetched_at: new Date(),
    rawPayload: raw
  };
}

/**
 * Live call to JSearch. Returns the raw job array (JSearch's own field
 * names) — callers map/cache as needed. Counts against the JSearch quota
 * (Section 2.1), so only call this from cache-miss paths and the cron pull.
 */
async function searchJobsLive({ query, country, page = 1 }) {
  const response = await axios.get(`${jsearch.baseUrl}/search`, {
    headers: {
      'X-RapidAPI-Key': jsearch.apiKey,
      'X-RapidAPI-Host': jsearch.apiHost
    },
    params: {
      query,
      country,
      page,
      num_pages: 1,
      language: 'en'
    },
    timeout: 15000
  });

  return response.data?.data?.jobs || [];
}

/**
 * Maps raw JSearch jobs into the canonical Job shape and upserts them,
 * deduped by job_id (Section 3.2). Returns the persisted documents.
 */
async function cacheJobs(rawJobs = []) {
  const ops = rawJobs
    .filter((raw) => raw.job_id)
    .map((raw) => ({
      updateOne: {
        filter: { job_id: raw.job_id },
        update: { $set: mapJSearchResultToJob(raw) },
        upsert: true
      }
    }));

  if (!ops.length) return [];

  await Job.bulkWrite(ops, { ordered: false });

  const jobIds = ops.map((op) => op.updateOne.filter.job_id);
  return Job.find({ job_id: { $in: jobIds } }).sort({ fetched_at: -1 });
}

/**
 * Cache-first country search (Section 3.3): reads the Job cache first;
 * only falls back to a live JSearch call (and caches the result) on a
 * cache miss, to conserve the JSearch quota.
 */
async function searchJobsByCountry(rawCountry, { page = 1, limit = 20 } = {}) {
  const countryCode = normalizeCountryToCode(rawCountry);

  const cached = await Job.find({ country: new RegExp(`^${countryCode}$`, 'i') })
    .sort({ fetched_at: -1 })
    .limit(limit);

  if (cached.length > 0) {
    return { source: 'cache', jobs: cached };
  }

  const rawJobs = await searchJobsLive({ query: 'jobs', country: countryCode, page });
  const jobs = await cacheJobs(rawJobs);

  return { source: 'live', jobs: jobs.slice(0, limit) };
}

module.exports = {
  mapJSearchResultToJob,
  searchJobsLive,
  cacheJobs,
  searchJobsByCountry
};
