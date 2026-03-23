const express = require('express');
const router = express.Router();
const candidateController = require('../controllers/candidateController');
const auth = require('../middleware/authMiddleware');

// 1. تسجيل مرشح جديد (Public)
router.post('/register', candidateController.registerCandidate);

// 2. تسجيل دخول المرشح (Public)
router.post('/loginCandidate', candidateController.loginCandidate);

// 3. جلب قائمة كل المرشحين (Public - يُفضل تكون عامة للناخبين)
// شيلنا الـ auth من هنا عشان الناخب يشوف القائمة أول ما يفتح التطبيق
router.get('/list', candidateController.listCandidates);

// 4. جلب بيانات مرشح معين بالتفصيل (Public)
// دي اللي عملنا فيها الـ Left Join والـ Trim ومعدتش محتاجة Token
router.get('/profile/:id', candidateController.getCandidateProfile);

// 5. الـ Endpoint الجديد: جلب عدد الأصوات فقط (Public)
// دي الدالة المنفصلة اللي طلبتها عشان تحسب الأصوات Live
router.get('/votes/:id', candidateController.getCandidateVotes);

module.exports = router;