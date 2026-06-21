const router = require('express').Router();
const memberController = require('../controllers/member.controller');
const { asyncHandler } = require('../utils/asyncHandler');
const { verifyFirebaseToken } = require('../middleware/firebaseAuth');
const { validateRequest } = require('../middleware/validateRequest');
const {
  createMemberSchema,
  updateMemberSchema,
  memberIdSchema
} = require('../validators/member.validator');

router.use(verifyFirebaseToken);

router.post('/', validateRequest(createMemberSchema), asyncHandler(memberController.createMember));
router.get('/', asyncHandler(memberController.getAllMembers));
router.get('/:id', validateRequest(memberIdSchema), asyncHandler(memberController.getMemberById));
router.patch('/:id', validateRequest(updateMemberSchema), asyncHandler(memberController.updateMember));
router.get('/:id/balance', validateRequest(memberIdSchema), asyncHandler(memberController.getMemberBalance));
router.get('/:id/contributions', validateRequest(memberIdSchema), asyncHandler(memberController.getContributionHistory));

module.exports = router;
