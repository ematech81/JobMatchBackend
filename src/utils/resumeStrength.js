/**
 * Scores how complete a ParsedResume is, 0-100, and names what is missing.
 *
 * This drives the dashboard's "Profile Strength" card. It is deliberately
 * computed from fields the matching engine actually uses, so the suggestions
 * point at work that genuinely improves match quality rather than at cosmetic
 * profile padding.
 */
const CRITERIA = [
  {
    key: 'fullName',
    weight: 10,
    label: 'Add your full name',
    met: (r) => Boolean(r.fullName && r.fullName.trim())
  },
  {
    key: 'desiredTitles',
    weight: 25,
    label: 'Add at least one desired job title',
    // Titles carry 60% of the match score — the single biggest lever.
    met: (r) => (r.desiredTitles || []).length > 0
  },
  {
    key: 'preferredCountry',
    weight: 15,
    label: 'Set your preferred country',
    // Without this, matching cannot filter to a market at all.
    met: (r) => Boolean(r.preferredCountry)
  },
  {
    key: 'skills',
    weight: 25,
    label: 'List at least 5 skills',
    met: (r) => (r.skills || []).length >= 5
  },
  {
    key: 'experience',
    weight: 15,
    label: 'Add your work experience',
    met: (r) => (r.experience || []).length > 0
  },
  {
    key: 'education',
    weight: 10,
    label: 'Add your education',
    met: (r) => (r.education || []).length > 0
  }
];

function computeResumeStrength(resume) {
  if (!resume) return { score: 0, missing: CRITERIA.map((c) => c.label) };

  let score = 0;
  const missing = [];

  for (const criterion of CRITERIA) {
    if (criterion.met(resume)) {
      score += criterion.weight;
    } else {
      missing.push(criterion.label);
    }
  }

  return { score, missing };
}

/** Total months of listed experience, used for the "X+ Years" summary. */
function totalExperienceMonths(resume) {
  return (resume?.experience || []).reduce(
    (sum, role) => sum + (Number(role.durationMonths) || 0),
    0
  );
}

module.exports = { computeResumeStrength, totalExperienceMonths };
