const express = require('express');
const router = express.Router();
const candidateController = require('../controllers/candidateController');
const auth = require('../middleware/authMiddleware');
const multer = require('multer');

const storage = multer.memoryStorage();

// الفلتر الجديد: يقبل الصور بكل أنواعها + ملفات PDF
const fileFilter = (req, file, cb) => {
    const allowedTypes = [
        'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/jfif', 
        'application/pdf'
    ];

    if (allowedTypes.includes(file.mimetype) || file.originalname.match(/\.(jpg|jpeg|png|webp|jfif|pdf)$/i)) {
        cb(null, true);
    } else {
        cb(new Error('نوع الملف غير مدعوم! يرجى رفع صور أو ملفات PDF فقط'), false);
    }
};

const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 7 * 1024 * 1024 } // زودناها لـ 7 ميجا عشان ملفات الـ PDF الكبيرة
});

const candidateUploadFields = upload.fields([
    { name: 'party_card_url', maxCount: 1 },
    { name: 'personal_photos_url', maxCount: 3 },
    { name: 'national_id_card_url', maxCount: 1 },
    { name: 'education_url', maxCount: 1 },
    { name: 'military_service_url', maxCount: 1 },
    { name: 'financial_disclosure_url', maxCount: 1 },
    { name: 'birth_certificate_url', maxCount: 1 },
    { name: 'fitness_health_url', maxCount: 1 },
    { name: 'criminal_record_url', maxCount: 1 },
    { name: 'deposit_receipt_url', maxCount: 1 },
    { name: 'election_symbol_url', maxCount: 1 }
]);

router.post('/register', candidateUploadFields, candidateController.registerCandidate);
router.post('/loginCandidate', candidateController.loginCandidate);
router.get('/list', auth, candidateController.listCandidates);

module.exports = router;