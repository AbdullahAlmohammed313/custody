// End-to-end check of sign-in and the forced password change.
// Run: npm run test:e2e
// Boots the app on a random port against the database in .env. Every account it
// creates uses an @e2e.test email and is deleted at the end, even on failure.
import type { INestApplication } from '@nestjs/common';
import { like } from 'drizzle-orm';
import type { AddressInfo, Server } from 'node:net';
import { createApp } from '../src/app.setup';
import { auth } from '../src/Auth/auth';
import { env } from '../src/config/env';
import { db, schema } from '../src/database';

let BASE = '';
const ORIGIN = env.FRONTEND_URL;
let app: INestApplication | undefined;
const results: string[] = [];
let failures = 0;

function check(name: string, ok: boolean, detail: string) {
  if (!ok) failures++;
  results.push(`${ok ? 'PASS' : 'FAIL'} | ${name}${ok ? '' : ` | ${detail}`}`);
}

// The parts of the response bodies these checks read
interface Body {
  message?: string;
  code?: string;
  username?: string;
  mustChangePassword?: boolean;
  department?: string;
  user?: {
    id?: string;
    username?: string;
    mustChangePassword?: boolean;
    department?: string;
    employeeNumber?: string;
  };
  paths?: Record<string, unknown>;
}

class Jar {
  cookies = new Map<string, string>();
  header() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }
  store(res: Response) {
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      const [k, v] = [pair.slice(0, i), pair.slice(i + 1)];
      if (v === '' || /max-age=0/i.test(c)) this.cookies.delete(k);
      else this.cookies.set(k, v);
    }
  }
}

async function call(method: string, path: string, jar?: Jar, body?: unknown) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      Origin: ORIGIN,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(jar?.cookies.size ? { Cookie: jar.header() } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  jar?.store(res);
  const text = await res.text();
  let json: Body | null = null;
  try {
    json = JSON.parse(text) as Body | null;
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

const signIn = (jar: Jar, username: string, password: string) =>
  call('POST', '/api/auth/sign-in/username', jar, { username, password });

async function main() {
  // Leftovers from an interrupted run would break account creation
  await db.delete(schema.users).where(like(schema.users.email, '%@e2e.test'));

  app = await createApp();
  await app.listen(0);
  const server = app.getHttpServer() as Server;
  const { port } = server.address() as AddressInfo;
  BASE = `http://localhost:${port}`;

  // Setup: an admin that already changed its password, and one that has not
  for (const [u, pending] of [
    ['e2e_admin', false],
    ['e2e_admin2', true],
  ] as const) {
    await auth.api.createUser({
      body: {
        name: u,
        email: `${u}@e2e.test`,
        password: 'AdminPass123',
        role: 'admin',
        data: {
          username: u,
          employeeNumber: `E2E-${u}`,
          jobTitle: 'x',
          department: 'x',
        },
      },
    });
    if (!pending) {
      await db
        .update(schema.users)
        .set({ mustChangePassword: false })
        .where(like(schema.users.email, `${u}@e2e.test`));
    }
  }

  const admin = new Jar();
  let r = await call('POST', '/api/auth/sign-in/email', admin, {
    email: 'e2e_admin@e2e.test',
    password: 'AdminPass123',
  });
  check('email sign-in is disabled (404)', r.status === 404, `${r.status}`);

  r = await call('POST', '/api/auth/sign-up/email', undefined, {
    name: 'x',
    email: 'x@e2e.test',
    password: 'Password123',
  });
  check(
    'public sign-up is closed (400)',
    r.status === 400,
    `${r.status} ${JSON.stringify(r.json)}`,
  );

  r = await signIn(admin, 'e2e_admin', 'AdminPass123');
  check(
    'admin signs in with username',
    r.status === 200,
    `${r.status} ${JSON.stringify(r.json)}`,
  );

  r = await call('GET', '/users/me', admin);
  check(
    'admin without pending change reaches /users/me',
    r.status === 200 && r.json?.username === 'e2e_admin',
    `${r.status} ${JSON.stringify(r.json)}`,
  );

  const base = {
    password: 'TempPass123',
    data: { employeeNumber: 'E2E-1', jobTitle: 'Tech', department: 'CS' },
  };
  r = await call('POST', '/api/auth/admin/create-user', admin, {
    ...base,
    name: 'Emp',
    email: 'emp@e2e.test',
  });
  check(
    'create user without username (400)',
    r.status === 400 && r.json?.message === 'username is required',
    `${r.status} ${JSON.stringify(r.json)}`,
  );

  r = await call('POST', '/api/auth/admin/create-user', admin, {
    ...base,
    name: 'Emp',
    email: 'emp@e2e.test',
    data: { ...base.data, username: 'bad name!' },
  });
  check(
    'create user with invalid username (400)',
    r.status === 400,
    `${r.status} ${JSON.stringify(r.json)}`,
  );

  r = await call('POST', '/api/auth/admin/create-user', admin, {
    ...base,
    name: 'Emp',
    email: 'emp@e2e.test',
    data: { ...base.data, username: 'Emp.One' },
  });
  const empId = r.json?.user?.id;
  check(
    'admin creates employee',
    r.status === 200 && !!empId,
    `${r.status} ${JSON.stringify(r.json)}`,
  );
  check(
    'username stored lowercase',
    r.json?.user?.username === 'emp.one',
    JSON.stringify(r.json?.user),
  );
  check(
    'new user must change password',
    r.json?.user?.mustChangePassword === true,
    JSON.stringify(r.json?.user),
  );

  r = await call('POST', '/api/auth/admin/create-user', admin, {
    ...base,
    name: 'Emp2',
    email: 'emp2@e2e.test',
    data: { ...base.data, employeeNumber: 'E2E-2', username: 'EMP.ONE' },
  });
  check(
    'duplicate username, different case (400)',
    r.status === 400,
    `${r.status} ${JSON.stringify(r.json)}`,
  );

  // Admin edits go through the same field checks as creation
  const update = (data: Record<string, unknown>) =>
    call('POST', '/api/auth/admin/update-user', admin, { userId: empId, data });
  r = await update({ department: '   ' });
  check(
    'admin update with blank department (400)',
    r.status === 400 && r.json?.message === 'department is required',
    `${r.status} ${JSON.stringify(r.json)}`,
  );
  r = await update({ employeeNumber: 'E2E-e2e_admin' });
  check(
    "admin update to another user's employee number (400)",
    r.status === 400 && r.json?.message === 'employeeNumber is already in use',
    `${r.status} ${JSON.stringify(r.json)}`,
  );
  r = await update({ employeeNumber: 'E2E-1', department: '  Physics  ' });
  check(
    'admin update keeping own number, trimmed department',
    r.status === 200 && r.json?.department === 'Physics',
    `${r.status} ${JSON.stringify(r.json)}`,
  );

  const empA = new Jar();
  const empB = new Jar();
  r = await signIn(empA, 'emp.one', 'wrong-password');
  check('wrong password rejected (401)', r.status === 401, `${r.status}`);
  r = await signIn(empA, 'Emp.One', 'TempPass123');
  check(
    'employee signs in (mixed-case username)',
    r.status === 200,
    `${r.status} ${JSON.stringify(r.json)}`,
  );
  r = await signIn(empB, 'emp.one', 'TempPass123');
  check(
    'employee signs in on a second device',
    r.status === 200,
    `${r.status}`,
  );

  r = await call('GET', '/api/auth/get-session', empA);
  check(
    'get-session allowed and shows the flag',
    r.status === 200 && r.json?.user?.mustChangePassword === true,
    `${r.status} ${JSON.stringify(r.json)}`,
  );

  r = await call('GET', '/users/me', empA);
  check(
    'NestJS route blocked while pending (403)',
    r.status === 403 && r.json?.code === 'PASSWORD_CHANGE_REQUIRED',
    `${r.status} ${JSON.stringify(r.json)}`,
  );

  r = await call('POST', '/api/auth/update-user', empA, { name: 'Changed' });
  check(
    'Better Auth route blocked while pending (403)',
    r.status === 403 && r.json?.code === 'PASSWORD_CHANGE_REQUIRED',
    `${r.status} ${JSON.stringify(r.json)}`,
  );

  r = await call('POST', '/api/auth/change-password', empA, {
    currentPassword: 'nope',
    newPassword: 'NewPass123',
  });
  check(
    'change-password with wrong current password fails',
    r.status === 400 || r.status === 401,
    `${r.status} ${JSON.stringify(r.json)}`,
  );
  r = await call('GET', '/users/me', empA);
  check('still blocked after failed change', r.status === 403, `${r.status}`);

  r = await call('POST', '/api/auth/change-password', empA, {
    currentPassword: 'TempPass123',
    newPassword: 'TempPass123',
  });
  check(
    'new password equal to the temporary one is rejected (400)',
    r.status === 400 && r.json?.code === 'PASSWORD_UNCHANGED',
    `${r.status} ${JSON.stringify(r.json)}`,
  );
  r = await call('GET', '/users/me', empA);
  check(
    'still blocked after reusing the password',
    r.status === 403,
    `${r.status}`,
  );

  r = await call('POST', '/api/auth/change-password', empA, {
    currentPassword: 'TempPass123',
    newPassword: 'NewPass123',
  });
  check(
    'change-password succeeds',
    r.status === 200,
    `${r.status} ${JSON.stringify(r.json)}`,
  );

  r = await call('GET', '/users/me', empA);
  check(
    'after change: /users/me works on the same device',
    r.status === 200 && r.json?.mustChangePassword === false,
    `${r.status} ${JSON.stringify(r.json)}`,
  );

  r = await call('GET', '/api/auth/get-session', empB);
  check(
    'after change: other device signed out',
    r.status === 200 && r.json === null,
    `${r.status} ${JSON.stringify(r.json)}`,
  );

  r = await signIn(new Jar(), 'emp.one', 'TempPass123');
  check('old password no longer works', r.status === 401, `${r.status}`);
  r = await signIn(new Jar(), 'emp.one', 'NewPass123');
  check('new password works', r.status === 200, `${r.status}`);

  r = await call('POST', '/api/auth/update-user', empA, { username: 'hacker' });
  check(
    'employee cannot change own username',
    r.status === 400,
    `${r.status} ${JSON.stringify(r.json)}`,
  );
  r = await call('POST', '/api/auth/update-user', empA, {
    department: 'Other',
  });
  check(
    'employee cannot change own department',
    r.status === 400,
    `${r.status} ${JSON.stringify(r.json)}`,
  );
  r = await call('POST', '/api/auth/update-user', empA, {
    name: 'Emp Renamed',
  });
  check(
    'employee can change own name',
    r.status === 200,
    `${r.status} ${JSON.stringify(r.json)}`,
  );

  r = await call('GET', '/api/auth/admin/list-users', empA);
  check(
    'employee cannot use admin routes (403)',
    r.status === 403,
    `${r.status}`,
  );

  r = await call('POST', '/api/auth/admin/set-user-password', admin, {
    userId: empId,
    newPassword: 'ResetPass123',
  });
  check(
    'admin resets the password',
    r.status === 200,
    `${r.status} ${JSON.stringify(r.json)}`,
  );
  r = await call('GET', '/api/auth/get-session', empA);
  check(
    'reset signs the employee out everywhere',
    r.status === 200 && r.json === null,
    `${r.status} ${JSON.stringify(r.json)}`,
  );

  const empC = new Jar();
  r = await signIn(empC, 'emp.one', 'ResetPass123');
  check(
    'employee signs in with reset password',
    r.status === 200,
    `${r.status}`,
  );
  r = await call('GET', '/users/me', empC);
  check(
    'reset password must be changed again (403)',
    r.status === 403 && r.json?.code === 'PASSWORD_CHANGE_REQUIRED',
    `${r.status} ${JSON.stringify(r.json)}`,
  );

  const admin2 = new Jar();
  r = await signIn(admin2, 'e2e_admin2', 'AdminPass123');
  check('pending admin signs in', r.status === 200, `${r.status}`);
  r = await call('GET', '/api/auth/admin/list-users', admin2);
  check(
    'pending admin blocked from admin routes (403)',
    r.status === 403 && r.json?.code === 'PASSWORD_CHANGE_REQUIRED',
    `${r.status} ${JSON.stringify(r.json)}`,
  );

  r = await call('POST', '/api/auth/admin/ban-user', admin, { userId: empId });
  r = await signIn(new Jar(), 'emp.one', 'ResetPass123');
  check(
    'banned user cannot sign in (403)',
    r.status === 403,
    `${r.status} ${JSON.stringify(r.json)}`,
  );

  r = await call('GET', '/users/me');
  check('no session: /users/me returns 401', r.status === 401, `${r.status}`);

  r = await call('POST', '/api/auth/sign-out', admin);
  check('sign-out works', r.status === 200, `${r.status}`);
  r = await call('GET', '/users/me', admin);
  check('after sign-out: 401', r.status === 401, `${r.status}`);

  r = await call('GET', '/docs/json');
  const paths = Object.keys(r.json?.paths ?? {});
  check(
    'docs list username sign-in',
    paths.includes('/api/auth/sign-in/username'),
    '',
  );
  check(
    'docs hide email sign-in and sign-up',
    !paths.includes('/api/auth/sign-in/email') &&
      !paths.includes('/api/auth/sign-up/email'),
    '',
  );
  check('docs list /users/me', paths.includes('/users/me'), paths.join(','));
}

main()
  .catch((e) => {
    failures++;
    console.error(e);
  })
  .finally(async () => {
    await app?.close();
    await db.delete(schema.users).where(like(schema.users.email, '%@e2e.test'));
    const left = await db.query.users.findMany({ columns: { username: true } });
    console.log(results.join('\n'));
    console.log(
      `\n${results.length - failures}/${results.length} passed; users left: ${left.map((u) => u.username).join(', ')}`,
    );
    process.exit(failures ? 1 : 0);
  });
