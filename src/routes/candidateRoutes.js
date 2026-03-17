const express = require('express');
const router = express.Router();
const candidateController = require('../controllers/candidateController');
const auth = require('../middleware/authMiddleware');

// لاحظ هنا: شلنا كل كود الـ multer والـ storage والـ fileFilter
// لأن البيانات هتوصل للسيرفر في Body واحد بصيغة JSON

// 1. تسجيل مرشح جديد (JSON Mode)
// مبرمج الفلاتر هيبعت الصور Base64 جوه الـ Body
router.post('/register', candidateController.registerCandidate);

// 2. تسجيل دخول المرشح
router.post('/loginCandidate', candidateController.loginCandidate);

// 3. عرض قائمة المرشحين (محمية بالميدل وير)
router.get('/list', auth, candidateController.listCandidates);

module.exports = router;