const axios = require('axios');
const { brevo, clientUrl } = require('../config/env');

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

/**
 * Thin wrapper around Brevo's transactional email API. Never throws — a
 * failed/unconfigured send is logged and swallowed so it can't break the
 * caller's actual work (matching, account updates, etc.). Callers that need
 * to know whether it actually sent can check the resolved boolean.
 */
async function sendEmail({ to, toName, subject, htmlContent }) {
  if (!brevo.apiKey) {
    console.warn(`[Email] BREVO_API_KEY not set — skipping email to ${to} ("${subject}")`);
    return false;
  }

  try {
    await axios.post(
      BREVO_ENDPOINT,
      {
        sender: { email: brevo.senderEmail, name: brevo.senderName },
        to: [{ email: to, name: toName || undefined }],
        subject,
        htmlContent
      },
      {
        headers: {
          'api-key': brevo.apiKey,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        timeout: 10000
      }
    );
    return true;
  } catch (err) {
    // Brevo requires the sender address to be verified in their dashboard —
    // the most likely first failure isn't a bad key, it's an unverified
    // sender. Surface that distinction in the log since it's not obvious
    // from a generic 401/403.
    const detail = err.response?.data?.message || err.message;
    console.error(`[Email] Failed to send "${subject}" to ${to}:`, detail);
    return false;
  }
}

/**
 * One digest email per matching run that produced new matches — not one
 * email per match. A first scan or a big cache refresh can surface a dozen
 * matches at once; a dozen separate emails would just get filtered as spam.
 */
function newMatchesEmail({ fullName, matches }) {
  const greeting = fullName ? `Hi ${fullName.split(' ')[0]},` : 'Hi,';
  const items = matches
    .slice(0, 5)
    .map((m) => `<li>${escapeHtml(m.jobTitle || 'A role')} at ${escapeHtml(m.employer || 'an employer')}</li>`)
    .join('');
  const more = matches.length > 5 ? `<p>...and ${matches.length - 5} more.</p>` : '';

  return {
    subject:
      matches.length === 1
        ? 'You have a new job match on JobMatch'
        : `You have ${matches.length} new job matches on JobMatch`,
    htmlContent: `
      <p>${greeting}</p>
      <p>We found ${matches.length === 1 ? 'a new match' : `${matches.length} new matches`} for you:</p>
      <ul>${items}</ul>
      ${more}
      <p><a href="${clientUrl}/matches">View your matches</a></p>
      <p style="color:#64748B;font-size:12px;">You're receiving this because email notifications are turned on in your JobMatch account settings. You can turn them off any time from your profile.</p>
    `
  };
}

/**
 * verifyToken is the raw, unhashed token — this is the only place it exists
 * outside the request that generated it (the DB only ever stores its hash).
 */
function verificationEmail({ fullName, verifyToken }) {
  const greeting = fullName ? `Hi ${fullName.split(' ')[0]},` : 'Hi,';
  const verifyUrl = `${clientUrl}/verify-email?token=${verifyToken}`;

  return {
    subject: 'Verify your email for JobMatch',
    htmlContent: `
      <p>${greeting}</p>
      <p>Confirm this is your email address to finish setting up your JobMatch account.</p>
      <p><a href="${verifyUrl}">Verify my email</a></p>
      <p style="color:#64748B;font-size:12px;">This link expires in 24 hours. If you didn't create a JobMatch account, you can ignore this email.</p>
    `
  };
}

function escapeHtml(str = '') {
  return str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

module.exports = { sendEmail, newMatchesEmail, verificationEmail };
