const fs = require('fs');
const path = require('path');
const { normalizeCountryToCode } = require('../utils/countryCodes');

/**
 * Serves the recorded JSearch responses in src/jobDummyData/ so the whole
 * pipeline (cache -> match -> socket notify) can be built and exercised
 * without spending the 200 req/month JSearch budget (Section 2.1).
 *
 * The fixture files hold raw JSON in .js files (no module.exports), so they
 * are read and parsed rather than required. Parsed results are memoized.
 */
const FIXTURE_DIR = path.join(__dirname, '..', 'jobDummyData');
const cache = new Map();

function loadFixture(name) {
  if (cache.has(name)) return cache.get(name);

  const filePath = path.join(FIXTURE_DIR, `${name}.js`);
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    throw new Error(`[Fixture] Could not load "${name}" from ${filePath}: ${err.message}`);
  }

  cache.set(name, parsed);
  return parsed;
}

/**
 * Fixture stand-in for a JSearch /search call. Returns raw JSearch-shaped
 * job objects so every downstream mapper behaves identically to live mode.
 *
 * The recorded fixture only covers US developer roles, so requests for other
 * countries are served the same jobs re-stamped with the requested country
 * and a suffixed job_id. That keeps them distinct cache entries and lets
 * country search and location scoring be tested for any market.
 */
function fixtureJobSearch({ query = '', country = '' } = {}) {
  const payload = loadFixture('jobSearch');
  const jobs = payload?.data?.jobs || [];

  const requested = normalizeCountryToCode(country);
  const matching = requested
    ? jobs.filter((j) => normalizeCountryToCode(j.job_country || '') === requested)
    : jobs;

  const selected = matching.length ? matching : jobs.map((j) => restampCountry(j, requested));

  return filterByQuery(selected, query);
}

/**
 * Placeholder terms used to satisfy JSearch's mandatory `query` param when the
 * caller only cares about country. They carry no relevance signal, so treating
 * them as keywords would wrongly narrow the fixture set.
 */
const GENERIC_TERMS = new Set(['job', 'jobs', 'all', 'any', 'vacancy', 'vacancies', 'hiring']);

/**
 * Loose keyword filter so different cron queries don't all yield an identical
 * result set — approximates JSearch's relevance behaviour well enough to build
 * and eyeball matching against.
 */
function filterByQuery(jobs, query) {
  const terms = String(query)
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2 && !GENERIC_TERMS.has(t));
  if (!terms.length) return jobs;

  const hits = jobs.filter((j) => {
    const haystack = `${j.job_title || ''} ${j.job_description || ''}`.toLowerCase();
    return terms.some((t) => haystack.includes(t));
  });

  // Never return nothing — an empty fixture result would send cache-miss paths
  // down a live fallback that fixture mode exists to avoid.
  return hits.length ? hits : jobs;
}

function restampCountry(job, countryCode) {
  if (!countryCode) return job;
  return {
    ...job,
    job_id: `${job.job_id}::${countryCode}`,
    job_country: countryCode
  };
}

module.exports = { loadFixture, fixtureJobSearch };
