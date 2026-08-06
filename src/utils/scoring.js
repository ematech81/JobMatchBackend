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

/**
 * Returns which of the resume's skills actually appear in the job text.
 * The names matter as much as the ratio: the UI shows them as the concrete
 * reason a job was matched.
 */
function matchedSkills(skills = [], jobText = '') {
  if (!skills.length || !jobText) return [];
  const text = normalize(jobText);
  return skills.filter((skill) => text.includes(normalize(skill)));
}

/**
 * Full breakdown of a resume/job match.
 *
 * The component scores are persisted alongside the total so clients can show
 * *why* something matched without re-deriving it — previously the UI invented
 * a breakdown by scaling the single overall score, which was not real data.
 *
 * Assumes the job already passed the preferred-country filter applied by
 * matchingService — see the WEIGHTS note above.
 */
function computeMatchBreakdown(resume, job) {
  const jobText = `${job.job_title || ''} ${job.job_description || ''}`;
  const resumeSkills = resume.skills || [];

  const tScore = titleScore(resume.desiredTitles, job.job_title);
  const matched = matchedSkills(resumeSkills, jobText);
  const sScore = resumeSkills.length ? matched.length / resumeSkills.length : 0;

  const overall = tScore * WEIGHTS.title + sScore * WEIGHTS.skills;

  return {
    score: Math.round(overall * 100),
    titleScore: Math.round(tScore * 100),
    skillScore: Math.round(sScore * 100),
    matchedSkills: matched
  };
}

/**
 * Overall match score (0-100) only. Thin wrapper kept for callers that do not
 * need the breakdown.
 */
function computeMatchScore(resume, job) {
  return computeMatchBreakdown(resume, job).score;
}

module.exports = { computeMatchScore, computeMatchBreakdown, tokenize, normalize };