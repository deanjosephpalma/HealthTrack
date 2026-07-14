/**
 * Apply offline_queueing_patient_rls.sql
 * Usage (from HealthTrackWEB):
 *   node scripts/apply-offline-queueing-migration.mjs
 */
import { createRequire } from 'module'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const require = createRequire(import.meta.url)
const pg = require('pg')
const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '../.env.seed'), quiet: true })

const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL
if (!databaseUrl) {
  console.error('Missing DATABASE_URL / SUPABASE_DB_URL in .env.seed — skip SQL apply.')
  console.error('Migration file is ready at supabase/migrations/offline_queueing_patient_rls.sql')
  process.exit(0)
}

const sqlPath = resolve(__dirname, '../supabase/migrations/offline_queueing_patient_rls.sql')
const sql = readFileSync(sqlPath, 'utf8')
const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } })
await client.connect()
try {
  await client.query(sql)
  console.log('Applied offline_queueing_patient_rls.sql successfully.')
} finally {
  await client.end()
}
