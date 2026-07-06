const router = require('express').Router();
const authController = require('../controllers/auth.controller');
const { asyncHandler } = require('../utils/asyncHandler');
const { validateRequest } = require('../middleware/validateRequest');
const { verifyToken } = require('../middleware/jwtAuth');
const { registerSchema, loginSchema, tokenSchema, onboardSchema } = require('../validators/auth.validator');

router.post('/register', validateRequest(registerSchema), asyncHandler(authController.register));
router.post('/login', validateRequest(loginSchema), asyncHandler(authController.login));
router.get('/profile', verifyToken, asyncHandler(authController.getProfile));
router.post('/verify-token', validateRequest(tokenSchema), asyncHandler(authController.verifyToken));
router.post('/onboard', verifyToken, validateRequest(onboardSchema), asyncHandler(authController.onboard));

module.exports = router;
