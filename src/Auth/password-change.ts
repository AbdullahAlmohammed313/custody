import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx,
  isAPIError,
} from 'better-auth/api';

// Users created or reset by an admin must change their password before using the system.
// The flag lives on the user (mustChangePassword) and is enforced in two places:
// - Better Auth routes: the before hook below
// - NestJS routes: SessionGuard (session.guard.ts)

export const PASSWORD_CHANGE_REQUIRED = {
  code: 'PASSWORD_CHANGE_REQUIRED',
  message: 'You must change your password before continuing',
} as const;

// Better Auth routes a user may call while a password change is pending
const ALLOWED_WHILE_PENDING = new Set([
  '/sign-in/username',
  '/sign-out',
  '/get-session',
  '/change-password',
  '/ok',
  '/error',
]);

export const passwordChangeBeforeHook = createAuthMiddleware(async (ctx) => {
  if (ctx.path === '/change-password') {
    const body = (ctx.body ?? {}) as {
      currentPassword?: unknown;
      newPassword?: unknown;
    };

    // Better Auth accepts a "new" password equal to the current one. Reject it,
    // otherwise the admin-issued password would survive the forced change
    if (
      typeof body.newPassword === 'string' &&
      body.newPassword === body.currentPassword
    ) {
      throw new APIError('BAD_REQUEST', {
        code: 'PASSWORD_UNCHANGED',
        message: 'New password must be different from the current password',
      });
    }

    // Changing the password always signs out other devices, so a session
    // opened with the admin-issued password does not survive the change
    return {
      context: { body: { ...body, revokeOtherSessions: true } },
    };
  }

  if (ALLOWED_WHILE_PENDING.has(ctx.path)) return;

  const session = await getSessionFromCtx(ctx);
  if (session?.user.mustChangePassword) {
    throw new APIError('FORBIDDEN', PASSWORD_CHANGE_REQUIRED);
  }
});

export const passwordChangeAfterHook = createAuthMiddleware(async (ctx) => {
  const returned = ctx.context.returned;
  if (!returned || isAPIError(returned)) return;
  const users = ctx.context.internalAdapter;

  if (ctx.path === '/change-password') {
    const userId =
      (returned as { user?: { id?: string } }).user?.id ??
      ctx.context.session?.user.id;
    if (userId) await users.updateUser(userId, { mustChangePassword: false });
    return;
  }

  if (ctx.path === '/admin/set-user-password') {
    // The admin now knows the password: force a new one and sign the user out everywhere
    const userId = (ctx.body as { userId?: string }).userId;
    if (!userId) return;
    await users.updateUser(userId, { mustChangePassword: true });
    await users.deleteUserSessions(userId);
  }
});
