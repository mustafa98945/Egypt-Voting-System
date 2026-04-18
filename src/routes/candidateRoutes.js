const express = require('express');
const router = express.Router();
const candidateController = require('../controllers/candidateController');

// الشاشة الأولى - التحقق والـ Auto-fill
router.post('/verify', candidateController.verifyBeforeRegister);

// إتمام التسجيل
router.post('/register', candidateController.registerCandidate);

// تسجيل الدخول
router.post('/loginCandidate', candidateController.loginCandidate);

// قائمة المرشحين
router.get('/list', candidateController.listCandidates);

// بروفايل مرشح
router.get('/profile/:id', candidateController.getCandidateProfile);

// أصوات مرشح
router.get('/votes/:id', candidateController.getCandidateVotes);

module.exports = router;