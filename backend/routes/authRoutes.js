const router = require('express').Router();
const { sendOtp, verifyOtp, logout } = require('../controllers/authController');

router.post('/send-otp', sendOtp);
router.post('/verify-otp', verifyOtp);
router.post('/logout', logout);

module.exports = router;
