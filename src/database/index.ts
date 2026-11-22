import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { env } from '../config/env';
import * as authSchema from './auth-schema';
import * as appSchema from './schema';

export const schema = { ...authSchema, ...appSchema };
const pool = new Pool({ connectionString: env.DATABASE_URL });
export const db = drizzle(pool, { schema });
