const express = require('express');
const router = express.Router();
const voterController = require('../controllers/voterController'); 
const voteController = require('../controllers/voteController'); 
const auth = require('../middleware/authMiddleware');

// --- الروابط (Routes) ---

// 1. التحقق من البيانات في السجل المدني (قبل التسجيل)
router.post('/verify', voterController.verifyBeforeRegister);

// 2. تسجيل حساب ناخب جديد (JSON Mode - Base64)
router.post('/register', voterController.registerVoter);

// 3. تسجيل الدخول (بيرجع التوكن اللي فيه الـ id والـ role)
router.post('/login', voterController.login);

// 4. جلب بيانات بطاقة الناخب (Voter Card) - محمية
// 💡 دي الـ Endpoint اللي هتعرض الكارت اللي على اليمين في الـ Figma
router.get('/voter-card', auth, voterController.getVoterCard);

/**
 * 5. عملية التصويت (محمي بـ JWT)
 * الميدل وير (auth) بيفك التوكن وبيجهز req.user
 */
router.post('/cast-vote', auth, voteController.castVote);

module.exports = router;