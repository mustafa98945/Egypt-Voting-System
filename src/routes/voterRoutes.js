const express = require('express');
const router = express.Router(); // التأكد من التعريف هنا
const voterController = require('../controllers/voterController');
const auth = require('../middleware/authMiddleware');

/**
 * 1. التحقق المبدئي (Auto-fill)
 * POST /api/voters/verify
 */
router.post('/verify', voterController.verifyBeforeRegister); // التأكد من حرف r وليس l

/**
 * 2. تسجيل حساب ناخب جديد
 * POST /api/voters/register
 */
router.post('/register', voterController.registerVoter);

/**
 * 3. تسجيل الدخول
 * POST /api/voters/login
 */
router.post('/login', voterController.login);

/**
 * 4. جلب بيانات الكارت الرقمي
 * GET /api/voters/profile
 */
router.get('/profile', auth, voterController.getVoterCard);

module.exports = router;