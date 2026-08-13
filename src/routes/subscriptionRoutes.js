const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { getPlans, getMySubscription, startCheckout } = require('../controllers/subscriptionController');

router.get('/plans', getPlans);
router.get('/me', auth, getMySubscription);
router.post('/checkout', auth, startCheckout);

module.exports = router;
