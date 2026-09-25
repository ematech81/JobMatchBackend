const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireAdmin = require('../middleware/requireAdmin');
const {
  getStats,
  listUsers,
  getUserDetail,
  listSubscriptions,
  getJobCacheHealth
} = require('../controllers/adminController');

// Gated once for the whole router rather than per-route — every endpoint
// here is admin-only, so there's no route that should ever skip either check.
router.use(auth, requireAdmin);

router.get('/stats', getStats);
router.get('/users', listUsers);
router.get('/users/:id', getUserDetail);
router.get('/subscriptions', listSubscriptions);
router.get('/job-cache', getJobCacheHealth);

module.exports = router;
