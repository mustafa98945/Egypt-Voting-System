const express = require('express');
const router = express.Router();
const candidateController = require('../controllers/candidateController');
const auth = require('../middleware/authMiddleware');

// 1. تسجيل مرشح جديد (Public)
router.post('/register', candidateController.registerCandidate);

// 2. تسجيل دخول المرشح - سواء بالوجه أو الإيميل (Public)
router.post('/loginCandidate', candidateController.loginCandidate);

// 3. جلب قائمة كل المرشحين (Protected - محتاج Token)
// دي اللي بتعرض القائمة الرئيسية اللي بيختار منها الناخب
router.get('/list', auth, candidateController.listCandidates);

// 4. جلب بيانات مرشح معين بالتفصيل (Protected - محتاج Token)
// 💡 دي الـ Endpoint اللي هتعرض الصفحة اللي على الشمال في الـ Figma
router.get('/profile/:id', auth, candidateController.getCandidateProfile);

module.exports = router;