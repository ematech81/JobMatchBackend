const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { register, login, getMe, updateMe } = require('../controllers/authController');

router.post('/register', register);
router.post('/login', login);
router.get('/me', auth, getMe);
router.patch('/me', auth, updateMe);

module.exports = router;