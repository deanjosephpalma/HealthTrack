import { readFileSync } from 'node:fs'
import dotenv from 'dotenv'
import pg from 'pg'
dotenv.config({ path: new URL('../.env.seed', import.meta.url), quiet: true })
const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL
if (!connectionString) {
  console.error('Database connection is not configured. Apply emergency_triage.sql, then three_point_triage.sql, in Supabase SQL Editor.')
  process.exit(1)
}
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 })
try {
  await client.connect()
  await client.query(readFileSync(new URL('../supabase/migrations/emergency_triage.sql', import.meta.url), 'utf8'))
  await client.query(readFileSync(new URL('../supabase/migrations/three_point_triage.sql', import.meta.url), 'utf8'))
  console.log('Emergency triage migration applied. Configure RHU-approved cutoffs on the emergency dashboard.')
} catch (error) {
  console.error('Migration failed:', error.message)
  process.exitCode = 1
} finally { await client.end() }
