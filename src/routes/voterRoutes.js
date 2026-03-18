const express = require('express');
const router = express.Router();
const voterController = require('../controllers/voterController'); // تأكد إن الاسم voterController وليس voterControllers
const voteController = require('../controllers/voteController'); 
const auth = require('../middleware/authMiddleware');

// --- الروابط (Routes) ---

// 1. التحقق من البيانات في السجل المدني (قبل التسجيل)
router.post('/verify', voterController.verifyBeforeRegister);

// 2. تسجيل حساب ناخب جديد (JSON Mode - Base64)
router.post('/register', voterController.registerVoter);

// 3. تسجيل الدخول (بيرجع التوكن اللي فيه الـ id والـ role)
router.post('/login', voterController.login);

/**
 * 4. عملية التصويت (محمي بـ JWT)
 * ملاحظة: يفضل أن يكون المسار /cast-vote ليكون واضحاً
 * الميدل وير (auth) بيفك التوكن وبيجهز req.user
 */
router.post('/cast-vote', auth, voteController.castVote);

module.exports = router;