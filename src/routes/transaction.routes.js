const router = require('express').Router();
const transactionController = require('../controllers/transaction.controller');
const { asyncHandler } = require('../utils/asyncHandler');
const { verifyToken } = require('../middleware/jwtAuth');
const { requireRole } = require('../middleware/requireRole');
const { validateRequest } = require('../middleware/validateRequest');
const {
  contributionSchema,
  repaymentSchema,
  memberTransactionsSchema
} = require('../validators/transaction.validator');

router.use(verifyToken);

router.post('/contributions', requireRole('TREASURER'), validateRequest(contributionSchema), asyncHandler(transactionController.recordContribution));
router.post('/repayments', requireRole('TREASURER'), validateRequest(repaymentSchema), asyncHandler(transactionController.recordRepayment));
router.get('/', asyncHandler(transactionController.getAllTransactions));
router.get('/member/:memberId', validateRequest(memberTransactionsSchema), asyncHandler(transactionController.getTransactionsForMember));

module.exports = router;

