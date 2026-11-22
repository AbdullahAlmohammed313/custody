// Creates the first admin account, since public sign-up is closed
// Run: npm run db:seed (reads the admin details from .env)
// The admin must change this password on first sign-in, like every new account
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { auth } from '../Auth/auth';
import { db, schema } from './index';

const seedEnv = z
  .object({
    SEED_ADMIN_NAME: z.string().min(1).default('Admin'),
    SEED_ADMIN_USERNAME: z.string().min(3).default('admin'),
    SEED_ADMIN_EMAIL: z.email(),
    SEED_ADMIN_PASSWORD: z.string().min(8),
  })
  .parse(process.env);

async function main() {
  const email = seedEnv.SEED_ADMIN_EMAIL.toLowerCase();
  const username = seedEnv.SEED_ADMIN_USERNAME.toLowerCase();

  const existing = await db.query.users.findFirst({
    columns: { id: true, username: true },
    where: eq(schema.users.email, email),
  });

  if (existing) {
    // Admins created before username sign-in existed have no username yet
    if (!existing.username) {
      await db
        .update(schema.users)
        .set({ username, displayUsername: seedEnv.SEED_ADMIN_USERNAME })
        .where(eq(schema.users.id, existing.id));
      console.log(`Admin already exists; username set to: ${username}`);
      return;
    }
    console.log(`Admin already exists: ${existing.username}`);
    return;
  }

  // A server-side call without headers skips the session check in /admin/create-user
  await auth.api.createUser({
    body: {
      name: seedEnv.SEED_ADMIN_NAME,
      email,
      password: seedEnv.SEED_ADMIN_PASSWORD,
      role: 'admin',
      data: {
        username: seedEnv.SEED_ADMIN_USERNAME,
        employeeNumber: 'ADMIN-001',
        jobTitle: 'System Manager',
        department: 'Administration',
      },
    },
  });
  console.log(`Admin created: ${username}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
