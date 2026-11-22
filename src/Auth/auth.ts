import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { APIError } from 'better-auth/api';
import { admin, openAPI, username } from 'better-auth/plugins';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { and, eq, ne } from 'drizzle-orm';
import { db, schema } from '../database';
import { env } from '../config/env';
import {
  passwordChangeAfterHook,
  passwordChangeBeforeHook,
} from './password-change';

// College fields on the user. input: false means users cannot set them
// themselves (sign-up is closed and /update-user rejects them); admins set them
// via /admin/create-user and /admin/update-user
const userFields = {
  employeeNumber: {
    type: 'string',
    required: true,
    unique: true,
    input: false,
  },
  jobTitle: { type: 'string', required: true, input: false },
  department: { type: 'string', required: true, input: false },
  // true until the user replaces the password an admin gave them
  mustChangePassword: {
    type: 'boolean',
    required: true,
    defaultValue: true,
    input: false,
  },
} as const;

const requiredUserFields = [
  'employeeNumber',
  'jobTitle',
  'department',
] as const;

// Trims the college fields present in `user` and rejects empty values or an
// employee number already used by someone else, with a clear 400 instead of a
// database error. Better Auth skips these checks for admin routes.
// On create every field is required; on update only the fields sent are checked.
async function checkUserFields(
  user: Record<string, unknown>,
  { creating, userId }: { creating: boolean; userId?: string },
) {
  const data: Record<string, string> = {};
  for (const field of requiredUserFields) {
    const value = user[field];
    if (value === undefined && !creating) continue;
    if (typeof value !== 'string' || value.trim() === '') {
      throw new APIError('BAD_REQUEST', { message: `${field} is required` });
    }
    data[field] = value.trim();
  }

  if (data.employeeNumber) {
    const sameNumber = eq(schema.users.employeeNumber, data.employeeNumber);
    const taken = await db.query.users.findFirst({
      columns: { id: true },
      // On update, the user's own current number is not a conflict
      where: userId ? and(sameNumber, ne(schema.users.id, userId)) : sameNumber,
    });
    if (taken) {
      throw new APIError('BAD_REQUEST', {
        message: 'employeeNumber is already in use',
      });
    }
  }

  return { data };
}

// Users sign in with their username, so every account needs one.
// The username plugin checks its format and uniqueness
function requireUsername(user: Record<string, unknown>) {
  const login = user.username;
  if (typeof login !== 'string' || login.trim() === '') {
    throw new APIError('BAD_REQUEST', { message: 'username is required' });
  }
}

export const baseAuthOptions = {
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins: [env.FRONTEND_URL],
  database: drizzleAdapter(db, { provider: 'pg', schema, usePlural: true }),
} satisfies BetterAuthOptions;

export const auth = betterAuth({
  ...baseAuthOptions,
  // Public sign-up is closed: only admins create accounts.
  // Email/password stays enabled because username sign-in uses the same credentials
  emailAndPassword: { enabled: true, disableSignUp: true },
  // Users sign in with username and password only
  disabledPaths: ['/sign-in/email'],
  user: { additionalFields: userFields },
  databaseHooks: {
    user: {
      create: {
        before: (user) => {
          requireUsername(user);
          return checkUserFields(user, { creating: true });
        },
      },
      update: {
        // /admin/update-user sends the target user's id in the body
        before: (data, ctx) =>
          checkUserFields(data, {
            creating: false,
            userId: (ctx?.body as { userId?: string } | undefined)?.userId,
          }),
      },
    },
  },
  hooks: {
    before: passwordChangeBeforeHook,
    after: passwordChangeAfterHook,
  },
  plugins: [
    // Adds role and banned to the user. Banning deletes the user's sessions and blocks sign-in
    admin({
      defaultRole: 'user',
      adminRoles: ['admin'],
      bannedUserMessage:
        'The account is disabled; contact the system administrator',
    }),
    // Adds username sign-in (/sign-in/username). Usernames are stored lowercase
    // and only an admin can change them (via /admin/update-user)
    username({ immutableUsername: true }),
    // Generates the OpenAPI schema for auth routes, merged into Swagger (src/docs/swagger.ts)
    openAPI({ disableDefaultReference: true }),
  ],
});
