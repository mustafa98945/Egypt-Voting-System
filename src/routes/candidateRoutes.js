const express = require('express');
const router = express.Router();
const multer = require('multer');
const candidateController = require('../controllers/candidateController');
const auth = require('../middlewares/authMiddleware');

// إعداد multer
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 } 
});

// تعريف الحقول
const candidateUploadFields = upload.fields([
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
]);

// الروابط
router.post('/register', candidateUploadFields, candidateController.registerCandidate);
router.post('/login', candidateController.loginCandidate);
router.get('/list', candidateController.listCandidates);

module.exports = router;