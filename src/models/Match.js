const mongoose = require('mongoose');

const matchSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
    score: { type: Number, required: true },
    // Component scores behind `score`, persisted so clients can explain a
    // match instead of inferring a breakdown from the total.
    titleScore: { type: Number, default: 0 },
    skillScore: { type: Number, default: 0 },
    matchedSkills: { type: [String], default: [] },
    matchedAt: { type: Date, default: Date.now },
    notified: { type: Boolean, default: false }
  },
  { timestamps: true }
);

matchSchema.index({ userId: 1, jobId: 1 }, { unique: true });

module.exports = mongoose.model('Match', matchSchema);