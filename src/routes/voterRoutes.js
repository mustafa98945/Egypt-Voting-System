const express = require('express');
const router = express.Router();
const voterController = require('../controllers/voterController');
const auth = require('../middleware/authMiddleware');

// ✅ الشاشة الأولى - التحقق
router.post('/verify', voterController.verifyBeforeRegister);

// ✅ إتمام التسجيل
router.post('/register', voterController.registerVoter);

// ✅ تسجيل الدخول
router.post('/login', voterController.login);

// ✅ Edit Profile (بيانات البروفايل)
router.get('/profile', auth, voterController.getVoterProfile);

module.exports = router;