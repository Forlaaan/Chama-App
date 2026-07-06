const express = require('express');
const router = express.Router();
const mpesaController = require('../controllers/mpesa.controller');
const { verifyFirebaseToken } = require('../middleware/firebaseAuth');

// The STK push route requires authentication
router.post('/stkpush', verifyFirebaseToken, mpesaController.initiateSTKPush);

// The callback route does not require Firebase token as it comes from Safaricom
router.post('/callback', mpesaController.mpesaCallback);

module.exports = router;
