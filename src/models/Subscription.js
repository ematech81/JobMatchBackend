const mongoose = require('mongoose');

/**
 * One document per user (unique userId) — a user has exactly one current
 * plan, not a history of line items. `status` starts 'pending' the moment a
 * plan is selected and only becomes 'active' once a real KoraPay payment is
 * confirmed via webhook.
 */
const subscriptionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    plan: { type: String, enum: ['trial', 'monthly'], required: true },
    status: { type: String, enum: ['pending', 'active', 'expired', 'canceled'], default: 'pending' },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'NGN' },
    // The KoraPay transaction reference generated at checkout time — format
    // `JMT-{uuid}`, required by the shared korapay-webhook-router to route
    // the eventual webhook back to this app (routes on the prefix before the
    // first '-'). This is a distinct value from `_id`, generated up front,
    // not looked-up-by-id, since it has to exist before KoraPay ever calls
    // back. `koraPayReference` below is a different thing: KoraPay's own
    // payment_reference, only known after the fact.
    checkoutReference: { type: String, default: null, unique: true, sparse: true, index: true },
    koraPayReference: { type: String, default: null },
    startedAt: { type: Date, default: null },
    currentPeriodEnd: { type: Date, default: null }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Subscription', subscriptionSchema);
