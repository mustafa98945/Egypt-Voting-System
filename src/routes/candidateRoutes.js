const express = require('express');
const router = express.Router();
const candidateController = require('../controllers/candidateController');
const auth = require('../middleware/authMiddleware'); // ✅ لازم تضيف ده

// التحقق
router.post('/verify', candidateController.verifyBeforeRegister);

// تسجيل
router.post('/register', candidateController.registerCandidate);

// تسجيل دخول
router.post('/loginCandidate', candidateController.loginCandidate);

// ✅ لازم تضيف auth هنا
router.get('/list', auth, candidateController.listCandidates);

router.get('/profile/:id', auth, candidateController.getCandidateProfile);
router.get('/votes/:id', auth, candidateController.getCandidateVotes);

module.exports = router;