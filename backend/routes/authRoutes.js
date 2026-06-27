const router = require('express').Router();
const { signup, sendOtp, verifyOtp, logout } = require('../controllers/authController');

router.post('/signup', signup);
router.post('/send-otp', sendOtp);
router.post('/verify-otp', verifyOtp);
router.post('/logout', logout);

module.exports = router;
