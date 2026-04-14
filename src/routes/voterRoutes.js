const express = require('express');
const router = express.Router();
const voterController = require('../controllers/voterController'); 
const voteController = require('../controllers/voteController'); 
const auth = require('../middleware/authMiddleware');

// --- الروابط (Routes) ---

// 1. التحقق من البيانات في السجل المدني (قبل التسجيل)
router.post('/verify', voterController.verifyBeforeRegister);

// 2. تسجيل حساب ناخب جديد
router.post('/register', voterController.registerVoter);

// 3. تسجيل الدخول
router.post('/login', voterController.login);

// 4. جلب بيانات بطاقة الناخب (Voter Card) - محمية بالتوكن
// تأكد إن الدالة دي اسمها getVoterCard في الـ voterController
router.get('/voter-card', auth, voterController.getVoterCard);

/**
 * 5. عملية التصويت (محمي بـ JWT)
 * ملاحظة: تأكد من أن الدالة في voteController اسمها castVote
 */
if (voteController && voteController.castVote) {
    router.post('/cast-vote', auth, voteController.castVote);
} else {
    console.error("⚠️ تنبيه: دالة castVote غير معرفة في voteController");
}

module.exports = router;