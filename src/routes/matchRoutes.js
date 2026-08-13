const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireResume = require('../middleware/requireResume');
const requireActiveSubscription = require('../middleware/requireActiveSubscription');
const { getMyMatches, rerunMyMatches, getScanSummary, getMatchForJob } = require('../controllers/matchController');

router.get('/', auth, requireResume, requireActiveSubscription, getMyMatches);
router.post('/rerun', auth, requireResume, requireActiveSubscription, rerunMyMatches);
// No requireActiveSubscription here on purpose — this powers the
// post-onboarding scan screen, which runs *before* a subscription can
// exist. It already 404s inline if there's no resume yet.
router.get('/scan-summary', auth, getScanSummary);
router.get('/job/:jobId', auth, requireResume, requireActiveSubscription, getMatchForJob);

module.exports = router;