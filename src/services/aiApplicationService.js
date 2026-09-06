const axios = require('axios');
const { anthropic } = require('../config/env');

const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
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
- Respond with ONLY a JSON object, no markdown code fences, no commentary: {"summary": "...", "coverLetter": "..."}`;

/**
 * Real call to Claude — no fallback/stub path. If ANTHROPIC_API_KEY is
 * unset, the controller should refuse before ever reaching this (see
 * applicationController.generateApplication), the same pattern as
 * korapayService/emailService for their own missing keys.
 */
async function generateTailoredApplication({ resume, job, addedSkills }) {
  const userPrompt = `CANDIDATE RESUME:\n${buildResumeBlock(resume, addedSkills)}\n\nJOB POSTING:\n${buildJobBlock(job)}`;

  const res = await axios.post(
    ANTHROPIC_ENDPOINT,
    {
      model: anthropic.model,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }]
    },
    {
      headers: {
        'x-api-key': anthropic.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      timeout: 60000
    }
  );

  const rawText = res.data?.content?.[0]?.text || '';
  // Claude generally complies with "no code fences", but strip them
  // defensively rather than let a rare non-compliant response 500.
  const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error('AI response was not valid JSON — could not parse generated content.');
  }

  if (!parsed.summary || !parsed.coverLetter) {
    throw new Error('AI response was missing summary or coverLetter.');
  }

  return { summary: parsed.summary, coverLetter: parsed.coverLetter };
}

module.exports = { generateTailoredApplication };
