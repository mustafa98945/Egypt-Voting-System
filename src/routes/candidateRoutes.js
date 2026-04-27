const express = require('express');
const router = express.Router();
const candidateController = require('../controllers/candidateController');
const auth = require('../middleware/authMiddleware');

// ✅ التحقق الأولي
router.post('/verify', candidateController.verifyBeforeRegister);

// ✅ تسجيل مرشح
router.post('/register', candidateController.registerCandidate);

// ✅ تسجيل دخول
router.post('/loginCandidate', candidateController.loginCandidate);

// ✅ قائمة المرشحين (فلترة حسب administrative_unit)
router.get('/list', auth, candidateController.listCandidates);

// ✅ Profile الشخصي (Edit Profile Screen)
router.get('/profile', auth, candidateController.getCandidateProfile);

// ✅ Public Profile لعرض مرشح معين (مثلاً عند الضغط عليه)
router.get('/public-profile/:id', auth, candidateController.getFullPublicProfile);

// ✅ عدد الأصوات
router.get('/votes/:id', auth, candidateController.getCandidateVotes);

module.exports = router;