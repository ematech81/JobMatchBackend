const axios = require('axios');
const { apilayer } = require('../config/env');

/**
 * Sends a resume file buffer to APILayer's Resume Parser API. Replaces
 * Affinda (see affindaService, removed) after Affinda's account ran out of
 * parsing credits (403 no_parsing_credits — a billing issue, not fixable in
 * code). Confirmed against a real call: the raw binary goes straight in the
 * request body (not multipart), auth is the `apikey` header, and a resume
 * that's too short/sparse gets a distinct 400 `{"message":"File too small"}`
 * rather than a generic failure — surfaced as FILE_TOO_SMALL so the
 * controller can give the user an actionable message instead of a generic
 * "service unavailable".
 */
async function parseResumeWithApilayer(fileBuffer) {
  let response;
  try {
    response = await axios.post(`${apilayer.baseUrl}/upload`, fileBuffer, {
      headers: {
        'Content-Type': 'application/octet-stream',
        apikey: apilayer.apiKey
      },
      timeout: 60000,
      maxBodyLength: Infinity
    });
  } catch (err) {
    if (err.response?.status === 400 && err.response.data?.message === 'File too small') {
      const tooSmall = new Error('Resume file is too small/sparse for the parser to process');
      tooSmall.code = 'FILE_TOO_SMALL';
      throw tooSmall;
    }
    throw err;
  }

  return mapApilayerToCanonical(response.data);
}

// "Month YYYY" strings (confirmed format from a real response) — invalid or
// missing values fall through as null rather than throwing, since this
// parser's date extraction is inconsistent (some experience entries come
// back with date_start/date_end, others only with a raw `dates` array).
function parseMonthYear(str) {
  if (!str) return null;
  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Missing end date is treated as "ongoing" (still employed) rather than 0
// duration — the more common real-world case for the most recent role.
function computeDurationMonths(startStr, endStr) {
  const start = parseMonthYear(startStr);
  if (!start) return 0;
  const end = parseMonthYear(endStr) || new Date();
  const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  return Math.max(0, months);
}

/**
 * Maps APILayer's response into the canonical ParsedResume shape. Confirmed
 * against a real parsed response — this is a materially noisier extractor
 * than Affinda: skills come back as single lowercased fragments (some
 * clearly mis-extracted from job titles/degree names, e.g. "Consulting",
 * "Computer science"), and `experience` can include fabricated entries where
 * certifications or section headings get parsed as if they were jobs. This
 * maps fields faithfully rather than trying to heuristically guess which
 * entries are "real" — over-aggressive filtering risks dropping genuine
 * data just as easily as it drops noise, and real-world resumes (not
 * synthetic test fixtures with certifications formatted like jobs) are
 * expected to parse more cleanly than the worst case seen in testing.
 */
function mapApilayerToCanonical(data) {
  const skills = [...new Set((data.skills || []).filter(Boolean))];

  const education = (data.education || [])
    .map((edu) => ({
      // This API doesn't separate a degree name from the institution — only
      // a single `name`, which in testing came back as the institution.
      degree: '',
      institution: edu.name || ''
    }))
    .filter((edu) => edu.institution);

  const experience = (data.experience || [])
    .map((exp) => ({
      title: exp.title || '',
      company: exp.organization || '',
      durationMonths: computeDurationMonths(exp.date_start, exp.date_end)
    }))
    .filter((exp) => exp.title && exp.company);

  const desiredTitles = experience[0]?.title ? [experience[0].title] : [];

  return {
    fullName: data.name || 'Unknown',
    desiredTitles,
    skills,
    experience,
    education,
    // This API doesn't return a candidate location/country field at all.
    preferredCountry: null,
    source: 'apilayer',
    rawText: JSON.stringify(data)
  };
}

module.exports = { parseResumeWithApilayer, mapApilayerToCanonical };
