const express = require('express');
const router = express.Router();
const voterController = require('../controllers/voterController');
const auth = require('../middleware/authMiddleware');

// الشاشة الأولى - التحقق والـ Auto-fill
router.post('/verify', voterController.verifyBeforeRegister);

// الشاشة التانية - إتمام التسجيل
router.post('/register', voterController.registerVoter);

// تسجيل الدخول
router.post('/login', voterController.login);

// البروفايل (محمي بالـ Auth)
router.get('/profile', auth, voterController.getVoterCard);

module.exports = router;