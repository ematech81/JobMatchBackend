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

module.exports = { buildResumeFromAnswers, generateResumePdf };