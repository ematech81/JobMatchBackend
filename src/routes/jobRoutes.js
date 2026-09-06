const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const requireResume = require('../middleware/requireResume');
const requireActiveSubscription = require('../middleware/requireActiveSubscription');
const {
  searchByCountry,
  getPublicStats,
  saveJob,
  unsaveJob,
  getSavedJobs,
  getJobById,
  getSimilarJobs
} = require('../controllers/jobController');
const {
  generateApplication,
  getApplication,
  updateApplication,
  downloadApplicationResumePdf,
  downloadApplicationCoverLetterPdf
} = require('../controllers/applicationController');

// Must come before /:jobId — Express would otherwise match "stats" as a
// jobId and route it into getJobById instead. Public and deliberately so
// (see getPublicStats): it's a count, not a listing.
router.get('/stats', getPublicStats);

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

// Application Generator — same gating as every other real-job-data route.
router.post('/:jobId/application', auth, requireResume, requireActiveSubscription, generateApplication);
router.get('/:jobId/application', auth, requireResume, requireActiveSubscription, getApplication);
router.put('/:jobId/application', auth, requireResume, requireActiveSubscription, updateApplication);
router.get('/:jobId/application/resume.pdf', auth, requireResume, requireActiveSubscription, downloadApplicationResumePdf);
router.get('/:jobId/application/cover-letter.pdf', auth, requireResume, requireActiveSubscription, downloadApplicationCoverLetterPdf);

module.exports = router;