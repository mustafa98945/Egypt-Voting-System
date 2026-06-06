const express = require('express');
const router = express.Router();
const voteController = require('../controllers/voteController');
const auth = require('../middleware/authMiddleware');

// تنفيذ التصويت
router.post('/cast', auth, voteController.castVote);

// التحقق من حالة التصويت
router.get('/status', auth, voteController.checkUserVotingStatus);

// جلب الـ Vote Card
router.get('/card', auth, voteController.getVoteCard);

// نتائج الانتخابات
router.get('/results', auth, voteController.getResults);

module.exports = router;