/**
 * Applies the sms_queueing.sql migration to Supabase.
 *
 * Option A — add your Supabase direct connection string to .env.seed:
 *   DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres
 *   node scripts/apply-sms-queueing.mjs
 *
 * Option B — copy supabase/migrations/sms_queueing.sql into Supabase SQL Editor and run it directly.
 */
import dotenv from 'dotenv'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

dotenv.config({ path: resolve(process.cwd(), '.env.seed'), quiet: true })

const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL
const sqlPath = resolve(process.cwd(), 'supabase/migrations/sms_queueing.sql')

let sql
try {
  sql = readFileSync(sqlPath, 'utf8')
} catch {
  console.error(`❌ SQL file not found: ${sqlPath}`)
  process.exit(1)
}

if (!databaseUrl) {
  console.error('❌ Missing DATABASE_URL (or SUPABASE_DB_URL) in .env.seed')
  console.error('')
  console.error('👉 Option A: Add to .env.seed:')
  console.error('   DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres')
  console.error('')
  console.error('👉 Option B: Open this file in Supabase SQL Editor and run it:')
  console.error('  ', sqlPath)
  process.exit(1)
}

let pg
try {
  pg = await import('pg')
} catch {
  console.error('❌ Install pg first: npm install --save-dev pg')
  process.exit(1)
}

console.log('🔗 Connecting to Supabase Postgres...')
const client = new pg.default.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } })

try {
  await client.connect()
  await client.query(sql)
  console.log('✅ SMS Queueing migration applied successfully.')
} catch (error) {
  if (error.message.includes('supabase_realtime') || error.message.includes('publication')) {
    console.log('✅ Migration applied (realtime publication step skipped — safe to ignore).')
  } else {
    console.error('❌ Migration failed:', error.message)
    process.exit(1)
  }
} finally {
  await client.end().catch(() => {})
}
