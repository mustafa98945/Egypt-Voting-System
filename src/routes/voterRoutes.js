const express = require('express');
const router = express.Router();
const voterController = require('../controllers/voterControllers'); 
const upload = require('../middlewares/multer'); 
const auth = require('../middlewares/authMiddleware'); // لحماية الروتس الحساسة

// 1. التحقق من البيانات في السجل المدني (قبل إنشاء الحساب)
// روت عام: متاح لأي مواطن يتأكد من بياناته
router.post('/verify', voterController.verifyBeforeRegister);

// 2. تسجيل حساب ناخب جديد (يستقبل صورة كارنيه الحزب/البطاقة)
// روت عام: لإنشاء الحساب لأول مرة
router.post('/register', upload.fields([
    { name: 'party_card_url', maxCount: 1 }
]), voterController.registerVoter);

// 3. تسجيل الدخول
// روت عام: بيتحقق من البيانات وبيرجع الـ Token
router.post('/login', voterController.login);

// --- الروتس اللي جاية دي أمثلة للي هنحتاجه في مرحلة التصويت ---

// 4. الحصول على بيانات الناخب الحالية (محمي بالـ Token)
// router.get('/me', auth, voterController.getMe);

// 5. عملية التصويت (محمي بالـ Token)
// router.post('/vote', auth, voteController.castVote);

module.exports = router;