const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const {
  searchByCountry,
  saveJob,
  getSavedJobs,
  getJobById,
  getSimilarJobs
} = require('../controllers/jobController');

router.get('/search', searchByCountry);
router.get('/saved', auth, getSavedJobs);
router.get('/:jobId/similar', getSimilarJobs);
router.get('/:jobId', getJobById);
router.post('/:jobId/save', auth, saveJob);

module.exports = router;