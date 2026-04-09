const express = require('express');
const router = express.Router();
const candidateController = require('../controllers/candidateController');

// 1. تسجيل المرشح (اللي بيعمل Triple Check ويسحب داتا السجل المدني)
router.post('/register', candidateController.registerCandidate);

// 2. تسجيل دخول المرشح (بالبريد أو الرقم القومي)
router.post('/loginCandidate', candidateController.loginCandidate);

// 3. جلب قائمة المرشحين (اللي بتظهر للناخبين في الصفحة الرئيسية)
router.get('/list', candidateController.listCandidates);

// 4. جلب البروفايل الكامل (كل بيانات المرشح المسحوبة والمرفوعة)
router.get('/profile/:id', candidateController.getCandidateProfile);

// 5. جلب الأصوات الحالية (Live Update)
router.get('/votes/:id', candidateController.getCandidateVotes);

module.exports = router;