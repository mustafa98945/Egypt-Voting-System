const express = require('express');
const router = express.Router();
// تأكد أن المسار لملف الـ controller صحيح تماماً
const candidateController = require('../controllers/candidateController');

// 1. تسجيل المرشح
// لو السيرفر بيضرب هنا، يبقى دالة registerCandidate مش موجودة في الـ candidateController
router.post('/register', candidateController.registerCandidate);

// 2. تسجيل دخول المرشح
router.post('/loginCandidate', candidateController.loginCandidate);

// 3. جلب قائمة المرشحين
router.get('/list', candidateController.listCandidates);

// 4. جلب البروفايل الكامل
router.get('/profile/:id', candidateController.getCandidateProfile);

// 5. جلب الأصوات الحالية
router.get('/votes/:id', candidateController.getCandidateVotes);

module.exports = router;