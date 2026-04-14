const express = require('express');
const router = express.Router();
// تأكد من المسار ده
const voteController = require('../controllers/voteController'); 
const auth = require('../middleware/authMiddleware');

router.post('/cast', auth, voteController.castVote);
router.get('/status', auth, voteController.checkUserVotingStatus);

module.exports = router;