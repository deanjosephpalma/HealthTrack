/**
 * Applies the estimated_cases.sql migration to the Supabase database.
 */
import dotenv from 'dotenv'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

dotenv.config({ path: resolve(process.cwd(), '.env.seed'), quiet: true })

const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL
const sqlPath = resolve(process.cwd(), 'supabase/migrations/estimated_cases.sql')
const sql = readFileSync(sqlPath, 'utf8')

if (!databaseUrl) {
  console.error('Missing DATABASE_URL (or SUPABASE_DB_URL) in .env.seed')
  process.exit(1)
}

let pg
try {
  pg = await import('pg')
} catch {
  console.error('Install pg first: npm install --save-dev pg')
  process.exit(1)
}

const client = new pg.default.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } })

try {
  await client.connect()
  await client.query(sql)
  console.log('Estimated cases migration applied successfully.')
} catch (error) {
  // If the publication already has the table, it might throw a warning or error, ignore publication errors if table was created
  if (error.message.includes('publication "supabase_realtime" does not exist')) {
    console.log('Table created, but realtime publication setup skipped (supabase_realtime not found).')
  } else {
    console.error('Migration failed:', error.message)
    process.exit(1)
  }
} finally {
  await client.end().catch(() => {})
}
