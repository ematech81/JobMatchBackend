const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema(
  {
    job_id: { type: String, required: true, unique: true, index: true },
    job_title: { type: String, index: true },
    employer_name: String,
    employer_logo: String,
    employer_website: String,
    country: { type: String, index: true },
    job_city: String,
    job_state: String,
    job_employment_type: String,
    job_is_remote: Boolean,
    apply_link: String,
    job_publisher: String,
    job_description: String,
    job_highlights: { type: mongoose.Schema.Types.Mixed },
    job_min_salary: Number,
    job_max_salary: Number,
    job_salary_currency: String,
    job_salary_period: String,
    job_posted_at: Date,
    fetched_at: { type: Date, default: Date.now },
    // Which pipeline produced this document — fixture-era cache entries
    // masquerading as fresh (same fetched_at freshness check, no way to
    // tell them apart from real JSearch results) has now caused real
    // confusion twice. Stored per-document specifically so "are we actually
    // serving live data" is a one-line query, not a manual cross-reference
    // against src/jobDummyData.
    source: { type: String, enum: ['fixture', 'live'], required: true },
    rawPayload: { type: mongoose.Schema.Types.Mixed }
  },
  { timestamps: true }
);

jobSchema.index({ job_title: 'text', job_description: 'text' });

module.exports = mongoose.model('Job', jobSchema);