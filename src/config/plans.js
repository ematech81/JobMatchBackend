/**
 * The only two plans JobMatch sells. A third tier ($19/mo — auto-apply +
 * application tracking) was scoped out: auto-apply would mean submitting
 * applications through arbitrary third-party systems (each `Job.apply_link`
 * points to an external site — Indeed, an employer's own ATS, etc.) with no
 * API of ours to call, which is a real integration project per employer, not
 * something addable here. Application tracking without real auto-apply
 * behind it would just be a generic status tracker, not the feature this
 * tier was meant to sell — so the whole tier is dropped until auto-apply is
 * genuinely feasible.
 */
// Priced in NGN, not USD — confirmed live against the real KoraPay account
// that only USD checkout fails ("no channel enabled"); NGN succeeds at a
// realistic amount. ~₦1,362/$1 at the time these were set (Aug 2026), round
// numbers chosen deliberately rather than an exact conversion that would
// need updating every time the exchange rate moves.
const PLANS = {
  trial: {
    id: 'trial',
    label: '7-Day Trial',
    amount: 7000,
    currency: 'NGN',
    interval: 'trial',
    trialDays: 7,
    description: 'Full access for 7 days. ₦7,000 charged immediately, one-time.'
  },
  monthly: {
    id: 'monthly',
    label: 'Monthly',
    amount: 14000,
    currency: 'NGN',
    interval: 'month',
    description: 'Unlimited matches, billed every 30 days.'
  }
};

module.exports = { PLANS };
