const express = require('express');
const router = express.Router();
const voterController = require('../controllers/voterController'); 
const voteController = require('../controllers/voteController'); 
const auth = require('../middleware/authMiddleware');

/**
 * 1. التحقق المبدئي (Auto-fill)
 * POST /api/voters/verify
 * بتسحب البيانات من السجل المدني بناءً على الرقم القومي والتواريخ
 */
router.post('/verify', voterController.verifyBeforeRegister);

/**
 * 2. تسجيل حساب ناخب جديد
 * POST /api/voters/register
 */
router.post('/register', voterController.registerVoter);

/**
 * 3. تسجيل الدخول
 * POST /api/voters/login
 */
router.post('/login', voterController.login);

/**
 * 4. جلب بيانات بطاقة الناخب (Voter Card)
 * GET /api/voters/voter-card
 */
router.get('/voter-card', auth, voterController.getVoterCard);

/**
 * 5. عملية التصويت
 * POST /api/voters/cast-vote
 */
if (voteController && voteController.castVote) {
    router.post('/cast-vote', auth, voteController.castVote);
} else {
    console.warn("⚠️ تنبيه: دالة castVote غير معرفة في voteController");
}

/**
 * 6. التحقق من حالة التصويت (هل صوت قبل كدة؟)
 * GET /api/voters/vote-status
 */
if (voteController && voteController.checkUserVotingStatus) {
    router.get('/vote-status', auth, voteController.checkUserVotingStatus);
}

module.exports = router;