const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const upload = require('../middleware/upload');
const {
  uploadResume,
  generateResume,
  getMyResume,
  updateMyResume,
  downloadResumePdf
} = require('../controllers/resumeController');

router.post('/upload', auth, upload.single('resume'), uploadResume); // Path A
router.post('/generate', auth, generateResume); // Path B
router.get('/me', auth, getMyResume);
router.put('/me', auth, updateMyResume);
router.get('/me/pdf', auth, downloadResumePdf);

module.exports = router;