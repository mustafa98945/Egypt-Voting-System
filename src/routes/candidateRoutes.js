const express = require('express');
const router = express.Router();
const candidateController = require('../controllers/candidateController');

router.post('/register', candidateController.registerCandidate);

module.exports = router;