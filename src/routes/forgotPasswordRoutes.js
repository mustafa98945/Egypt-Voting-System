const express = require('express');
const router = express.Router();
const forgotPasswordController = require('../controllers/forgotPasswordController');

router.post('/send-otp', forgotPasswordController.sendOTP);
router.post('/verify-otp', forgotPasswordController.verifyOTP);
router.post('/reset-password', forgotPasswordController.resetPassword);

module.exports = router;