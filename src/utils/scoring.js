/**
 * MVP keyword/skill overlap scoring.
 * Weighting (adjustable later per Section 6 open items):
 *  - Title match: 50%
 *  - Skill overlap: 35%
 *  - Location match: 15%
 */
const WEIGHTS = {
  title: 0.5,
  skills: 0.35,
  location: 0.15
};

function normalize(str = '') {
  return str.toLowerCase().trim();
}

function tokenize(str = '') {
  return normalize(str)
    .split(/[\s,/|-]+/)
    .filter(Boolean);
}

function titleScore(desiredTitles = [], jobTitle = '') {
  if (!jobTitle || desiredTitles.length === 0) return 0;
  const jobTokens = new Set(tokenize(jobTitle));
  let best = 0;
  for (const title of desiredTitles) {
    const titleTokens = tokenize(title);
    if (titleTokens.length === 0) continue;
    const overlap = titleTokens.filter((t) => jobTokens.has(t)).length;
    const ratio = overlap / titleTokens.length;
    if (ratio > best) best = ratio;
  }
  return best; // 0..1
}

function skillScore(skills = [], jobText = '') {
  if (!skills.length || !jobText) return 0;
  const text = normalize(jobText);
  const matched = skills.filter((skill) => text.includes(normalize(skill)));
  return matched.length / skills.length; // 0..1
}

function locationScore(preferredCountry, jobCountry) {
  if (!preferredCountry || !jobCountry) return 0;
  return normalize(preferredCountry) === normalize(jobCountry) ? 1 : 0;
}

/**
 * Computes overall match score (0-100) between a resume and a job.
 */
function computeMatchScore(resume, job) {
  const jobText = `${job.job_title || ''} ${job.job_description || ''}`;

  const tScore = titleScore(resume.desiredTitles, job.job_title);
  const sScore = skillScore(resume.skills, jobText);
  const lScore = locationScore(resume.preferredCountry, job.country);

  const overall =
    tScore * WEIGHTS.title + sScore * WEIGHTS.skills + lScore * WEIGHTS.location;

  return Math.round(overall * 100);
}

module.exports = { computeMatchScore, tokenize, normalize };