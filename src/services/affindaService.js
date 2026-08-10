const { Readable } = require('stream');
const { AffindaAPI, AffindaCredential } = require('@affinda/affinda');
const { affinda } = require('../config/env');

const credential = new AffindaCredential(affinda.apiKey);
const client = new AffindaAPI(credential, affinda.apiBase);

/**
 * Sends a resume file buffer to Affinda's official API (not the RapidAPI
 * marketplace listing) for parsing, into the workspace's "Resume Parser"
 * document type. `documentType` is pinned explicitly — auto-classification
 * silently no-ops on plain/sparse documents (returns documentType: null and
 * an empty data object, no error), so extraction never runs without it.
 * `compact: true` strips Affinda's raw/confidence/bounding-box wrapper
 * around every field, leaving just the parsed values.
 */
async function parseResumeWithAffinda(fileBuffer, filename) {
  // The SDK's own example reads from fs.createReadStream, which carries a
  // filename via its `.path`. A buffer-backed stream doesn't, so `fileName`
  // is passed explicitly instead.
  const file = Readable.from(fileBuffer);

  const doc = await client.createDocument({
    file,
    fileName: filename,
    workspace: affinda.workspace,
    documentType: affinda.documentType,
    // The generated client serializes form fields as strings — a JS boolean
    // here throws ("options.compact ... must be of type string") even
    // though the field is semantically a boolean.
    compact: 'true'
  });

  return mapAffindaToCanonical(doc);
}

/**
 * Maps Affinda's compact response for the "Resume Parser" document type
 * (extractor "resume-v4" / "Resume (NextGen)") into our canonical
 * ParsedResume shape. Confirmed against a real response from this
 * workspace's own document type — NOT the generic example Affinda's agent
 * gave earlier, which turned out to be a different document type's schema
 * (that one used candidateNameFirst/candidateNameFamily and a flat `skill`
 * string array; this one uses firstName/familyName and skill *objects*).
 */
function mapAffindaToCanonical(doc) {
  const data = doc?.data || {};

  const fullName =
    [data.candidateName?.firstName, data.candidateName?.middleName, data.candidateName?.familyName]
      .filter(Boolean)
      .join(' ') || 'Unknown';

  // Skills come back as EMSI-classified objects, not plain strings — and the
  // same skill can be detected from multiple resume sections (e.g. once
  // from workExperience, once from education), so de-dupe by name.
  const skillNames = (data.skill || []).map((s) => s.name).filter(Boolean);
  const skills = [...new Set(skillNames)];

  const experience = (data.workExperience || []).map((exp) => ({
    title: exp.workExperienceJobTitle || '',
    company: exp.workExperienceOrganization || '',
    // Affinda computes this itself (handles "isCurrent" internally) —
    // no need to parse dates ourselves.
    durationMonths: exp.workExperienceDates?.durationInMonths ?? 0
  }));

  const education = (data.education || []).map((edu) => ({
    degree: edu.educationAccreditation || edu.educationLevel?.label || '',
    institution: edu.educationOrganization || ''
  }));

  // Both candidates are kept, not just one — matchingService's titleScore
  // takes the best overlap across every entry in desiredTitles, so adding a
  // second candidate can only raise a job's score, never lower it.
  //
  // `objective` is Affinda's own extraction of stated career intent (e.g.
  // "Seeking a Software Engineer role..." -> "Engineer role"), which lines
  // up with job-posting titles far better than a founder's most recent role
  // ("Founder and Solo Developer" shares almost no tokens with real
  // postings) — but Affinda's extraction can itself drop qualifying words
  // ("Software"), so the most-recent-role title stays in the mix too rather
  // than being replaced outright.
  const desiredTitles = [data.objective, experience[0]?.title].filter(Boolean);

  // countryCode (e.g. "US") matches the ISO-ish codes the rest of the app's
  // country matching/filtering already expects, unlike the full country
  // name. Frequently null — this workspace doesn't always resolve a
  // top-level candidate location.
  const preferredCountry = data.location?.countryCode || data.location?.country || null;

  return {
    fullName,
    desiredTitles,
    skills,
    experience,
    education,
    preferredCountry,
    source: 'affinda',
    rawText: data.rawText || JSON.stringify(doc)
  };
}

module.exports = { parseResumeWithAffinda, mapAffindaToCanonical };
