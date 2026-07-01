const { AppError } = require('../utils/errors');

/**
 * Express middleware factory that restricts access to specific roles.
 * Must be used AFTER verifyFirebaseToken (which populates req.user.member).
 *
 * Usage:
 *   router.post('/contributions', requireRole('TREASURER'), handler);
 *   router.patch('/:id/reject', requireRole('TREASURER', 'ADMIN'), handler);
 *
 * @param  {...string} allowedRoles - One or more role strings (MEMBER, TREASURER, ADMIN)
 * @returns {Function} Express middleware
 */
function requireRole(...allowedRoles) {
  return (req, _res, next) => {
    const member = req.user?.member;

    if (!member) {
      return next(
        new AppError('Authenticated user is not linked to a Member record', 403)
      );
    }

    if (!allowedRoles.includes(member.role)) {
      return next(
        new AppError(
          `Role '${member.role}' is not authorised for this operation. ` +
          `Requires: ${allowedRoles.join(' or ')}.`,
          403
        )
      );
    }

    next();
  };
}

module.exports = { requireRole };
