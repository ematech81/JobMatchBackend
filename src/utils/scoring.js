/**
 * MVP keyword/skill overlap scoring.
 * Weighting (adjustable later per Section 6 open items):
 *  - Title match: 60%
 *  - Skill overlap: 40%
 *
 * Location is deliberately absent: the guide treats preferred country as a
 * filter, so matchingService excludes other countries before scoring. Scoring
 * it too would add a constant to every surviving job — inflating all scores
 * equally while distinguishing nothing.
 */
const WEIGHTS = {
  title: 0.6,
  skills: 0.4
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

/**
 * Computes overall match score (0-100) between a resume and a job.
 * Assumes the job already passed the preferred-country filter applied by
 * matchingService — see the WEIGHTS note above.
 */
function computeMatchScore(resume, job) {
  const jobText = `${job.job_title || ''} ${job.job_description || ''}`;

  const tScore = titleScore(resume.desiredTitles, job.job_title);
  const sScore = skillScore(resume.skills, jobText);

  const overall = tScore * WEIGHTS.title + sScore * WEIGHTS.skills;

  return Math.round(overall * 100);
}

module.exports = { computeMatchScore, tokenize, normalize };