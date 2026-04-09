const express = require('express');
const router = express.Router();
const candidateController = require('../controllers/candidateController');

// 1. تسجيل المرشح (Triple Check + Auto-fill Data Response)
// ده اللي هيرجع الـ JSON "الدسم" اللي فيه المحافظة والعنوان والسن عشان الصفحة تتملي
router.post('/register', candidateController.registerCandidate);

// 2. تسجيل دخول المرشح (بالبريد أو الرقم القومي)
router.post('/loginCandidate', candidateController.loginCandidate);

// 3. جلب قائمة المرشحين (للناخبين)
router.get('/list', candidateController.listCandidates);

// 4. جلب البروفايل الكامل (المدمج مع بيانات السجل المدني)
router.get('/profile/:id', candidateController.getCandidateProfile);

// 5. جلب الأصوات الحالية
router.get('/votes/:id', candidateController.getCandidateVotes);

module.exports = router;