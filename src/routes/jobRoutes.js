const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireResume = require('../middleware/requireResume');
const requireActiveSubscription = require('../middleware/requireActiveSubscription');
const {
  searchByCountry,
  saveJob,
  unsaveJob,
  getSavedJobs,
  getJobById,
  getSimilarJobs
} = require('../controllers/jobController');

// Every route here returns real job data — all of it requires a completed
// resume AND an active subscription, not just being logged in. These used
// to be fully public (no `auth` at all on search/:jobId/similar), which was
// the actual source of the "Find Jobs shows real data to anyone" bug.
router.get('/search', auth, requireResume, requireActiveSubscription, searchByCountry);
router.get('/saved', auth, requireResume, requireActiveSubscription, getSavedJobs);
router.get('/:jobId/similar', auth, requireResume, requireActiveSubscription, getSimilarJobs);
router.get('/:jobId', auth, requireResume, requireActiveSubscription, getJobById);
router.post('/:jobId/save', auth, requireResume, requireActiveSubscription, saveJob);
router.delete('/:jobId/save', auth, requireResume, requireActiveSubscription, unsaveJob);

module.exports = router;