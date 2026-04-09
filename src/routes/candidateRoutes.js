const express = require('express');
const router = express.Router();
const candidateController = require('../controllers/candidateController');

/**
 * @description مسارات المرشحين (Candidate Routes)
 * جميع هذه المسارات عامة (Public) لتسهيل وصول الناخبين وتجربة المستخدم
 */

// 1. تسجيل مرشح جديد - تشمل معالجة الـ OCR ورفع الملفات لـ Supabase
router.post('/register', candidateController.registerCandidate);

// 2. تسجيل دخول المرشح - يدعم الدخول بالبريد أو الرقم القومي
router.post('/loginCandidate', candidateController.loginCandidate);

// 3. عرض قائمة المرشحين - تعرض الكروت الأساسية (الصورة، الاسم، الحزب)
router.get('/list', candidateController.listCandidates);

// 4. عرض البروفايل التفصيلي - تعرض (السن، المحافظة، المؤهل، السيرة الذاتية)
// تم استخدام الـ ID لجلب البيانات المدمجة من السجل المدني
router.get('/profile/:id', candidateController.getCandidateProfile);

// 5. عداد الأصوات المباشر - Endpoint خفيف لإرجاع رقم الأصوات فقط
router.get('/votes/:id', candidateController.getCandidateVotes);

module.exports = router;