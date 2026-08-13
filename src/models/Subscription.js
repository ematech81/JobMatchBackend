const mongoose = require('mongoose');

/**
 * One document per user (unique userId) — a user has exactly one current
 * plan, not a history of line items. `status` starts 'pending' the moment a
 * plan is selected and only becomes 'active' once a real KoraPay payment is
 * confirmed (webhook, not wired up yet — see korapayService).
 */
const subscriptionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    plan: { type: String, enum: ['trial', 'monthly'], required: true },
    status: { type: String, enum: ['pending', 'active', 'expired', 'canceled'], default: 'pending' },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'USD' },
    koraPayReference: { type: String, default: null },
    startedAt: { type: Date, default: null },
    currentPeriodEnd: { type: Date, default: null }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Subscription', subscriptionSchema);
