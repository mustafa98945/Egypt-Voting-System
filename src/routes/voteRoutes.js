const express = require('express');
const router = express.Router();
const voteController = require('../controllers/voteController');
const auth = require('../middleware/authMiddleware');

router.post('/cast',    auth, voteController.castVote);
router.get('/status',  auth, voteController.checkUserVotingStatus);
router.get('/card',    auth, voteController.getVoteCard);
router.get('/results', auth, voteController.getResults);

module.exports = router;