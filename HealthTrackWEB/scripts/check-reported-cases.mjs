import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function loadEnv(file) {
  try {
    const text = readFileSync(resolve(process.cwd(), file), 'utf8')
    for (const line of text.split(/\r?\n/)) {
      if (!line || line.trim().startsWith('#')) continue
      const i = line.indexOf('=')
      if (i < 0) continue
      const k = line.slice(0, i).trim()
      let v = line.slice(i + 1).trim()
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1)
      }
      if (!process.env[k]) process.env[k] = v
    }
  } catch {
    /* missing file ok */
  }
}

loadEnv('.env')
loadEnv('.env.seed')

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const anon = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
const service = process.env.SUPABASE_SERVICE_ROLE_KEY
const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL

console.log('VITE_SUPABASE_URL:', url ? 'yes' : 'NO')
console.log('ANON KEY:', anon ? 'yes' : 'NO')
console.log('SERVICE KEY:', service ? 'yes' : 'NO')
console.log('DATABASE_URL:', databaseUrl ? 'yes' : 'NO')

if (!url || !(service || anon)) {
  console.error('Missing Supabase credentials')
  process.exit(1)
}

const sb = createClient(url, service || anon)

const tables = [
  'estimated_cases',
  'patient_records',
  'tb_treatment_records',
  'animal_bite_doses',
  'tb_monitoring',
]

for (const t of tables) {
  const { error, count } = await sb.from(t).select('*', { count: 'exact', head: true })
  if (error) console.log(`[${t}] ERROR ${error.code}: ${error.message}`)
  else console.log(`[${t}] OK rows=${count}`)
}

const { data, error } = await sb
  .from('estimated_cases')
  .select('id, disease, barangay, estimated_count, status, report_date, latitude, longitude, created_at')
  .limit(10)

if (error) {
  console.log('\nestimated_cases select failed:', error.message)
  console.log('HINT: table likely missing — run scripts/apply-estimated-cases.mjs or SQL in Supabase.')
} else {
  console.log('\nestimated_cases sample:', data)
}
