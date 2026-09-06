const mongoose = require('mongoose');

/**
 * One per (user, job) pair — regenerating overwrites rather than piling up
 * a history, same reasoning as Subscription being one-per-user. `summary`
 * and `coverLetter` are the two pieces ApplicationGenerator actually
 * produces; editing either (the mockup's "Edit" button) just updates this
 * document in place, no separate revision history.
 */
const generatedApplicationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
    summary: { type: String, required: true },
    addedSkills: [String],
    coverLetter: { type: String, required: true },
    // Which model actually produced this — useful if AI_MODEL ever changes
    // and old generations need to be told apart from new ones.
    model: { type: String, default: null }
  },
  { timestamps: true }
);

generatedApplicationSchema.index({ userId: 1, jobId: 1 }, { unique: true });

module.exports = mongoose.model('GeneratedApplication', generatedApplicationSchema);
