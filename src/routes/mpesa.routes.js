const express = require('express');
const router = express.Router();
const mpesaController = require('../controllers/mpesa.controller');
const { verifyToken } = require('../middleware/jwtAuth');
const { asyncHandler } = require('../utils/asyncHandler');

// The STK push route requires authentication
router.post('/stkpush', verifyToken, asyncHandler(mpesaController.initiateSTKPush));

// The callback route does not require Firebase token as it comes from Safaricom
router.post('/callback', asyncHandler(mpesaController.mpesaCallback));

module.exports = router;
