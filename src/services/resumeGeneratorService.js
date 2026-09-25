const PDFDocument = require('pdfkit');

/**
 * Builds a canonical ParsedResume-shaped object from Q&A answers (Path B).
 * Expected `answers` shape:
 * {
 *   fullName, desiredTitles: [String], yearsExperience, skills: [String],
 *   pastRoles: [{ title, company, durationMonths }],
 *   education: [{ degree, institution }],
 *   preferredCountry
 * }
 */
function buildResumeFromAnswers(answers) {
  const {
    fullName,
    desiredTitles = [],
    skills = [],
    pastRoles = [],
    education = [],
    preferredCountry
  } = answers;

  return {
    fullName,
    desiredTitles: Array.isArray(desiredTitles) ? desiredTitles : [desiredTitles],
    skills,
    experience: pastRoles.map((role) => ({
      title: role.title,
      company: role.company,
      durationMonths: Number(role.durationMonths) || 0
    })),
    education: education.map((edu) => ({
      degree: edu.degree,
      institution: edu.institution
    })),
    preferredCountry,
    source: 'generated'
  };
}

/**
 * Renders a ParsedResume document into a downloadable PDF buffer.
 * Used as an upsell feature for Path B users (Section 5, step 8).
 */
function generateResumePdf(parsedResume) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(20).text(parsedResume.fullName || 'Resume', { underline: true });
    doc.moveDown();

    // Only present on a tailored resume (ApplicationGenerator) — the base
    // resume from onboarding never has one, and the section is skipped
    // entirely rather than rendered empty.
    if (parsedResume.summary) {
      doc.fontSize(14).text('Summary');
      doc.fontSize(11).text(parsedResume.summary);
      doc.moveDown();
    }

    if (parsedResume.desiredTitles?.length) {
      doc.fontSize(14).text('Desired Titles');
      doc.fontSize(11).text(parsedResume.desiredTitles.join(', '));
      doc.moveDown();
    }

    if (parsedResume.skills?.length) {
      doc.fontSize(14).text('Skills');
      doc.fontSize(11).text(parsedResume.skills.join(', '));
      doc.moveDown();
    }

    if (parsedResume.experience?.length) {
      doc.fontSize(14).text('Experience');
      parsedResume.experience.forEach((exp) => {
        doc
          .fontSize(11)
          .text(`${exp.title} — ${exp.company} (${exp.durationMonths} months)`);
      });
      doc.moveDown();
    }

    if (parsedResume.education?.length) {
      doc.fontSize(14).text('Education');
      parsedResume.education.forEach((edu) => {
        doc.fontSize(11).text(`${edu.degree}, ${edu.institution}`);
      });
      doc.moveDown();
    }

    if (parsedResume.preferredCountry) {
      doc.fontSize(14).text('Preferred Location');
      doc.fontSize(11).text(parsedResume.preferredCountry);
    }

    doc.end();
  });
}

/**
 * Renders a generated cover letter into a downloadable PDF buffer —
 * ApplicationGenerator's second document. Plain business-letter layout:
 * sender name, date, employer/role line, then the AI-generated body text.
 */
function generateCoverLetterPdf(coverLetterText, { fullName, jobTitle, employerName } = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    if (fullName) {
      doc.fontSize(14).text(fullName);
      doc.moveDown(0.5);
    }
    doc.fontSize(10).fillColor('#64748B').text(new Date().toLocaleDateString());
    doc.moveDown();

    if (jobTitle || employerName) {
      doc
        .fontSize(11)
        .fillColor('#0F172A')
        .text(`Re: Application for ${jobTitle || 'the role'}${employerName ? ` at ${employerName}` : ''}`);
      doc.moveDown();
    }

    doc.fontSize(11).fillColor('#191c1e').text(coverLetterText || '', { align: 'left' });

    doc.end();
  });
}

module.exports = { buildResumeFromAnswers, generateResumePdf, generateCoverLetterPdf };