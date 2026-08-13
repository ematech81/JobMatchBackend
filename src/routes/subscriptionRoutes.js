const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { getPlans, getMySubscription, startCheckout, handleWebhook } = require('../controllers/subscriptionController');

router.get('/plans', getPlans);
router.get('/me', auth, getMySubscription);
router.post('/checkout', auth, startCheckout);
// No auth — this is KoraPay's server calling us, not a signed-in user (see
// handleWebhook for how it verifies the request is genuinely from KoraPay).
router.post('/webhook', handleWebhook);

module.exports = router;
