const express = require('express');
const router = express.Router();
const candidateController = require('../controllers/candidateController');
const auth = require('../middleware/authMiddleware');

// إعداد multer
const multer = require('multer');
const storage = multer.memoryStorage();

// فلتر للتأكد إن الملفات المرفوعة صور فقط
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('نوع الملف غير مدعوم، يرجى رفع صور فقط'), false);
    }
};

const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: { 
        fileSize: 5 * 1024 * 1024, // 5 ميجا لكل ملف
        files: 15 // أقصى عدد ملفات في الطلب الواحد لتجنب الـ Spam
    }
});

// تعريف الحقول (11 حقل إجمالي)
const candidateUploadFields = upload.fields([
    { name: 'party_card_url', maxCount: 1 },         // اختياري
    { name: 'personal_photos_url', maxCount: 3 },     // إجباري (مصفوفة)
    { name: 'national_id_card_url', maxCount: 1 },    // إجباري
    { name: 'education_url', maxCount: 1 },           // إجباري
    { name: 'military_service_url', maxCount: 1 },    // إجباري
    { name: 'financial_disclosure_url', maxCount: 1 },// إجباري
    { name: 'birth_certificate_url', maxCount: 1 },   // إجباري
    { name: 'fitness_health_url', maxCount: 1 },      // إجباري
    { name: 'criminal_record_url', maxCount: 1 },     // إجباري
    { name: 'deposit_receipt_url', maxCount: 1 },     // إجباري
    { name: 'election_symbol_url', maxCount: 1 }      // إجباري
]);

// الروابط
// تسجيل المرشح
router.post('/register', candidateUploadFields, candidateController.registerCandidate);

// دخول المرشح
router.post('/loginCandidate', candidateController.loginCandidate);

// عرض قائمة المرشحين (محمية بـ Auth عشان الناخبين المسجلين بس يشوفوها)
router.get('/list', auth, candidateController.listCandidates);

module.exports = router;