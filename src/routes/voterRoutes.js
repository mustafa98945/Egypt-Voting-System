const express = require('express');
const router = express.Router();
const voterController = require('../controllers/voterControllers');
const voteController = require('../controllers/voteController'); 
const auth = require('../middleware/authMiddleware');

// --- الروابط (Routes) ---

// 1. التحقق من البيانات في السجل المدني (قبل التسجيل)
// دي بتفضل زي ما هي لأنها بتاخد نصوص بس
router.post('/verify', voterController.verifyBeforeRegister);

// 2. تسجيل حساب ناخب جديد (JSON Mode)
// شلنا الـ multer والـ upload.fields لأن الكارنيه هيتبعت Base64 جوه الـ JSON
router.post('/register', voterController.registerVoter);

// 3. تسجيل الدخول
router.post('/login', voterController.login);

// 4. عملية التصويت (محمي بـ JWT)
// الميدل وير (auth) بيفك التوكن وبيحط الـ voter_id في req.user
router.post('/vote', auth, voteController.castVote);

module.exports = router;