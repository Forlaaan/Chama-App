const router = require('express').Router();
const transactionController = require('../controllers/transaction.controller');
const { asyncHandler } = require('../utils/asyncHandler');
const { verifyFirebaseToken } = require('../middleware/firebaseAuth');
const { validateRequest } = require('../middleware/validateRequest');
const {
  contributionSchema,
  repaymentSchema,
  memberTransactionsSchema
} = require('../validators/transaction.validator');

router.use(verifyFirebaseToken);

router.post('/contributions', validateRequest(contributionSchema), asyncHandler(transactionController.recordContribution));
router.post('/repayments', validateRequest(repaymentSchema), asyncHandler(transactionController.recordRepayment));
router.get('/', asyncHandler(transactionController.getAllTransactions));
router.get('/member/:memberId', validateRequest(memberTransactionsSchema), asyncHandler(transactionController.getTransactionsForMember));

module.exports = router;
