const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { getMyMatches, rerunMyMatches,  getMatchForJob } = require('../controllers/matchController');

router.get('/', auth, getMyMatches);
router.post('/rerun', auth, rerunMyMatches);
router.get('/job/:jobId', auth, getMatchForJob);

module.exports = router;