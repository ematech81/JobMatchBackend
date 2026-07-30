const axios = require('axios');
const FormData = require('form-data');
const { affinda } = require('../config/env');

/**
 * Sends a resume file buffer to Affinda (via RapidAPI) for parsing.
 * Falls back gracefully — caller should catch and use a fallback parser if needed.
 */
async function parseResumeWithAffinda(fileBuffer, filename) {
  const form = new FormData();
  form.append('file', fileBuffer, filename);

  const response = await axios.post(`${affinda.baseUrl}/resume/parse`, form, {
    headers: {
      ...form.getHeaders(),
      'X-RapidAPI-Key': affinda.apiKey,
      'X-RapidAPI-Host': affinda.apiHost
    },
    timeout: 30000
  });

  return mapAffindaToCanonical(response.data);
}

/**
 * Maps Affinda's raw response into our canonical ParsedResume shape.
 * NOTE: Exact field names depend on Affinda's actual response schema —
 * adjust mapping once real sample responses are available.
 */
function mapAffindaToCanonical(affindaData) {
  const data = affindaData?.data || affindaData || {};

  const fullName = data.name?.raw || data.name || 'Unknown';

  const skills = (data.skills || []).map((s) => (typeof s === 'string' ? s : s.name)).filter(Boolean);

  const desiredTitles = data.profession ? [data.profession] : [];

  const experience = (data.workExperience || data.work_experience || []).map((exp) => ({
    title: exp.jobTitle || exp.job_title || '',
    company: exp.organization || exp.company || '',
    durationMonths: computeDurationMonths(exp.dates?.startDate, exp.dates?.endDate)
  }));

  const education = (data.education || []).map((edu) => ({
    degree: edu.accreditation?.education || edu.degree || '',
    institution: edu.organization || edu.institution || ''
  }));

  const preferredCountry = data.location?.country || null;

  return {
    fullName,
    desiredTitles,
    skills,
    experience,
    education,
    preferredCountry,
    source: 'affinda',
    rawText: JSON.stringify(affindaData)
  };
}

function computeDurationMonths(start, end) {
  if (!start) return 0;
  const startDate = new Date(start);
  const endDate = end ? new Date(end) : new Date();
  const months =
    (endDate.getFullYear() - startDate.getFullYear()) * 12 +
    (endDate.getMonth() - startDate.getMonth());
  return Math.max(months, 0);
}

module.exports = { parseResumeWithAffinda, mapAffindaToCanonical };