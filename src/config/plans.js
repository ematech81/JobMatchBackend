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
const PLANS = {
  trial: {
    id: 'trial',
    label: '7-Day Trial',
    amount: 5,
    currency: 'USD',
    interval: 'trial',
    trialDays: 7,
    description: 'Full access for a week, then $5 charges once.'
  },
  monthly: {
    id: 'monthly',
    label: 'Monthly',
    amount: 10,
    currency: 'USD',
    interval: 'month',
    description: 'Unlimited matches, billed every 30 days.'
  }
};

module.exports = { PLANS };
