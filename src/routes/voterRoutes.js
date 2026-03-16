const express = require('express');
const router = express.Router();
const voterController = require('../controllers/voterControllers');
const voteController = require('../controllers/voteController'); 
const auth = require('../middlewares/authMiddleware'); 

// استيراد multer وإعداده
const multer = require('multer');
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 3 * 1024 * 1024 } 
});

// --- الروابط (Routes) ---

// 1. التحقق من البيانات في السجل المدني (قبل التسجيل)
router.post('/verify', voterController.verifyBeforeRegister);

// 2. تسجيل حساب ناخب جديد (مع رفع الصور)
router.post('/register', upload.fields([
    { name: 'party_card_url', maxCount: 1 }
]), voterController.registerVoter);

// 3. تسجيل الدخول
router.post('/login', voterController.login);

// 4. عملية التصويت (محمي بـ JWT)
// هنا بنستخدم الـ auth عشان نتأكد إن المستخدم مسجل دخول
router.post('/vote', auth, voteController.castVote);

// 5. الحصول على بيانات الناخب (محمي) - مفيد للـ Profile في الـ App
// router.get('/me', auth, voterController.getMe);

module.exports = router;