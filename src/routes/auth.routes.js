const router = require('express').Router();
const authController = require('../controllers/auth.controller');
const { asyncHandler } = require('../utils/asyncHandler');
const { validateRequest } = require('../middleware/validateRequest');
const { verifyFirebaseToken } = require('../middleware/firebaseAuth');
const { registerSchema, loginSchema, tokenSchema } = require('../validators/auth.validator');

router.post('/register', validateRequest(registerSchema), asyncHandler(authController.register));
router.post('/login', validateRequest(loginSchema), asyncHandler(authController.login));
router.get('/profile', verifyFirebaseToken, asyncHandler(authController.getProfile));
router.post('/verify-token', validateRequest(tokenSchema), asyncHandler(authController.verifyToken));

module.exports = router;
