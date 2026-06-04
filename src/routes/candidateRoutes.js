const express = require('express');
const router = express.Router();
const candidateController = require('../controllers/candidateController');
const auth = require('../middleware/authMiddleware');

router.post('/verify', candidateController.verifyBeforeRegister);
router.post('/register', candidateController.registerCandidate);
router.post('/login', candidateController.loginCandidate);

router.get('/list', auth, candidateController.listCandidates);
router.get('/profile', auth, candidateController.getCandidateProfile);
router.get('/public-profile/:id', auth, candidateController.getFullPublicProfile);
router.get('/votes/:id', auth, candidateController.getCandidateVotes);

module.exports = router;