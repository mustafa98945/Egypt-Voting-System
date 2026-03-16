const express = require('express');
const router = express.Router();
const candidateController = require('../controllers/candidateController');
const upload = require('../middlewares/multer');
const auth = require('../middlewares/authMiddleware'); // استيراد الحماية

// 1. تسجيل مرشح جديد (Post)
// روت عام: يسمح لأي شخص بالتقديم
router.post('/register', upload.fields([
    { name: 'party_card_url', maxCount: 1 },
    { name: 'personal_photos_url', maxCount: 5 },     
    { name: 'national_id_card_url', maxCount: 1 },    
    { name: 'education_url', maxCount: 1 },           
    { name: 'military_service_url', maxCount: 1 },    
    { name: 'financial_disclosure_url', maxCount: 1 }, 
    { name: 'birth_certificate_url', maxCount: 1 },    
    { name: 'fitness_health_url', maxCount: 1 },       
    { name: 'criminal_record_url', maxCount: 1 },      
    { name: 'deposit_receipt_url', maxCount: 1 },      
    { name: 'election_symbol_url', maxCount: 1 }       
]), candidateController.registerCandidate);

// 2. الـ Smart Login (Post)
// روت عام: للتحقق من بيانات المرشح وإعطائه التوكن
router.post('/login', candidateController.loginCandidate);

// 3. جلب قائمة المرشحين للمواطنين (Get)
// روت عام: عشان أي ناخب يقدر يشوف قائمة الناس اللي في محافظته
// الرابط: /api/candidates/list?governorate=القاهرة
router.get('/list', candidateController.listCandidates);

// 4. (اختياري) مثال لروت محمي - جلب بيانات البروفايل الخاص بالمرشح
// لاحظ وجود الـ auth هنا عشان نضمن إن المرشح بس هو اللي يشوف ورقه الرسمي
// router.get('/profile', auth, candidateController.getCandidateProfile);

module.exports = router;