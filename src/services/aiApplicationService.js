const axios = require('axios');
const { openai } = require('../config/env');

const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const MAX_JOB_DESCRIPTION_CHARS = 3000;

function buildResumeBlock(resume, addedSkills) {
  const skills = [...new Set([...(resume.skills || []), ...(addedSkills || [])])];
  const experience = (resume.experience || [])
    .map((e) => `- ${e.title || 'Role'} at ${e.company || 'a company'} (${e.durationMonths || 0} months)`)
    .join('\n') || '- No experience listed';
  const education = (resume.education || [])
    .map((e) => `- ${e.degree || 'Degree'}${e.institution ? `, ${e.institution}` : ''}`)
    .join('\n') || '- No education listed';

  return `Name: ${resume.fullName || 'Candidate'}
Desired titles: ${(resume.desiredTitles || []).join(', ') || 'Not specified'}
Skills: ${skills.join(', ') || 'Not specified'}
Experience:
${experience}
Education:
${education}`;
}

function buildJobBlock(job) {
  const description = (job.job_description || '').slice(0, MAX_JOB_DESCRIPTION_CHARS);
  return `Title: ${job.job_title || 'Not specified'}
Employer: ${job.employer_name || 'Not specified'}
Location: ${job.job_city ? `${job.job_city}, ` : ''}${job.country || 'Not specified'}
Description:
${description}`;
}

const SYSTEM_PROMPT = `You write tailored job-application content for a job-matching platform. Given a candidate's resume and a specific job posting, produce:
1. A professional summary (2-4 sentences) that positions the candidate for THIS specific role, written in first person as it would appear at the top of their resume.
2. A complete cover letter (roughly 250-400 words) addressed to the employer, referencing the actual company and role, written in a professional but natural tone.

Hard rules:
- Only use experience, skills, and education actually present in the resume provided. Never invent accomplishments, employers, metrics, or credentials the candidate didn't list.
- You may phrase existing experience to emphasize its relevance to the job, but do not fabricate anything new.
- If the resume is thin for this role, write an honest, confident letter that doesn't overclaim — do not compensate for gaps by making things up.
- Respond with a JSON object with exactly these two keys: {"summary": "...", "coverLetter": "..."}`;

/**
 * Real call to OpenAI — no fallback/stub path. If OPENAI_API_KEY is unset,
 * the controller should refuse before ever reaching this (see
 * applicationController.generateApplication), the same pattern as
 * korapayService/emailService for their own missing keys.
 */
async function generateTailoredApplication({ resume, job, addedSkills }) {
  const userPrompt = `CANDIDATE RESUME:\n${buildResumeBlock(resume, addedSkills)}\n\nJOB POSTING:\n${buildJobBlock(job)}`;

  const res = await axios.post(
    OPENAI_ENDPOINT,
    {
      model: openai.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ],
      // Guarantees valid JSON back (OpenAI-specific — the API rejects this
      // option unless the prompt itself mentions "JSON", which it does
      // above), so no defensive code-fence-stripping is needed the way the
      // Claude version required.
      response_format: { type: 'json_object' },
      max_tokens: 2048,
      // Lower than OpenAI's default (1.0) — this is professional
      // resume/cover-letter copy, not creative writing; less variance
      // between regenerations of the same job is the right trade-off here.
      temperature: 0.7
    },
    {
      headers: {
        Authorization: `Bearer ${openai.apiKey}`,
        'content-type': 'application/json'
      },
      timeout: 60000
    }
  );

  const rawText = res.data?.choices?.[0]?.message?.content || '';

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error('AI response was not valid JSON — could not parse generated content.');
  }

  if (!parsed.summary || !parsed.coverLetter) {
    throw new Error('AI response was missing summary or coverLetter.');
  }

  return { summary: parsed.summary, coverLetter: parsed.coverLetter };
}

module.exports = { generateTailoredApplication };
