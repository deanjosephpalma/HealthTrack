/**
 * Bulk-provision Doctor / Nurse / BHW / Volunteer accounts from a CSV.
 * Staff cannot self-register — RLS + role trigger require the service role.
 *
 * Usage (from HealthTrackWEB):
 *   npm run seed:staff
 *   npm run seed:staff -- scripts/my-bhws.csv
 *
 * CSV columns (header required):
 *   email,password,role,name
 *
 * role must be one of: Doctor, Nurse, BHW, Volunteer
 *
 * Requires .env.seed with SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 */
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const ALLOWED_ROLES = new Set(['Doctor', 'Nurse', 'BHW', 'Volunteer'])

const envCandidates = [resolve(process.cwd(), '.env.seed')]

let loadedEnvPath = null
for (const path of envCandidates) {
  const result = dotenv.config({ path, quiet: true })
  if (result.parsed && Object.keys(result.parsed).length > 0) {
    loadedEnvPath = path
    break
  }
  if (result.error && result.error.code !== 'ENOENT') {
    throw result.error
  }
}

function validateRequiredEnv(name, value) {
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
}

function decodeJwtPayload(token) {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'))
  } catch {
    return null
  }
}

/** Minimal CSV parser: supports quoted fields and commas inside quotes. */
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    const next = text[i + 1]

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"'
        i += 1
      } else if (ch === '"') {
        inQuotes = false
      } else {
        field += ch
      }
      continue
    }

    if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(field.trim())
      field = ''
    } else if (ch === '\n' || (ch === '\r' && next === '\n')) {
      row.push(field.trim())
      field = ''
      if (row.some((cell) => cell !== '')) rows.push(row)
      row = []
      if (ch === '\r') i += 1
    } else if (ch !== '\r') {
      field += ch
    }
  }

  row.push(field.trim())
  if (row.some((cell) => cell !== '')) rows.push(row)

  return rows
}

function loadAccountsFromCsv(csvPath) {
  const raw = readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '')
  const rows = parseCsv(raw)
  if (rows.length < 2) {
    throw new Error('CSV needs a header row and at least one account row.')
  }

  const header = rows[0].map((h) => h.toLowerCase())
  const emailIdx = header.indexOf('email')
  const passwordIdx = header.indexOf('password')
  const roleIdx = header.indexOf('role')
  const nameIdx = header.indexOf('name')

  if (emailIdx < 0 || passwordIdx < 0 || roleIdx < 0 || nameIdx < 0) {
    throw new Error('CSV header must include: email,password,role,name')
  }

  const accounts = []
  for (let i = 1; i < rows.length; i += 1) {
    const cells = rows[i]
    const email = (cells[emailIdx] || '').trim()
    const password = (cells[passwordIdx] || '').trim()
    const role = (cells[roleIdx] || '').trim()
    const name = (cells[nameIdx] || '').trim()

    if (!email && !password && !role && !name) continue

    if (!email || !password || !role || !name) {
      throw new Error(`Row ${i + 1}: email, password, role, and name are all required.`)
    }
    if (!ALLOWED_ROLES.has(role)) {
      throw new Error(`Row ${i + 1}: invalid role "${role}". Use: ${[...ALLOWED_ROLES].join(', ')}`)
    }
    if (password.length < 6) {
      throw new Error(`Row ${i + 1}: password must be at least 6 characters.`)
    }

    accounts.push({ email, password, role, name })
  }

  return accounts
}

const supabaseUrl = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
validateRequiredEnv('SUPABASE_URL', supabaseUrl)
validateRequiredEnv('SUPABASE_SERVICE_ROLE_KEY', serviceRoleKey)

const keyPayload = decodeJwtPayload(serviceRoleKey)
if (keyPayload?.role && keyPayload.role !== 'service_role') {
  throw new Error(
    `SUPABASE_SERVICE_ROLE_KEY is invalid for seeding (detected role: ${keyPayload.role}). Use your service_role key.`,
  )
}

if (loadedEnvPath) {
  console.log(`Loaded environment from: ${loadedEnvPath}`)
} else {
  console.log('Loaded environment from process environment variables.')
}

const csvArg = process.argv[2]
const csvPath = resolve(process.cwd(), csvArg || 'scripts/staff-accounts.csv')

if (!existsSync(csvPath)) {
  console.error(`CSV not found: ${csvPath}`)
  console.error('Copy scripts/staff-accounts.example.csv → scripts/staff-accounts.csv and fill in your BHWs.')
  process.exit(1)
}

const accounts = loadAccountsFromCsv(csvPath)
console.log(`Seeding ${accounts.length} account(s) from ${csvPath}`)

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function findExistingUserByEmail(email) {
  const target = email.toLowerCase()
  let page = 1
  const perPage = 200

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
    if (error) throw new Error(`Failed to list auth users: ${error.message}`)

    const users = data?.users || []
    const found = users.find((user) => user.email?.toLowerCase() === target)
    if (found) return found
    if (users.length < perPage) return null
    page += 1
  }
}

async function seedAccount(account) {
  const existingUser = await findExistingUserByEmail(account.email)
  let userId = existingUser?.id

  if (!existingUser) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: account.email,
      password: account.password,
      email_confirm: true,
      user_metadata: {
        name: account.name,
        role: account.role,
      },
    })
    if (error) throw new Error(`Failed to create auth user for ${account.email}: ${error.message}`)
    userId = data.user.id
    console.log(`Created: ${account.email} (${account.role})`)
  } else {
    const { error } = await supabase.auth.admin.updateUserById(userId, {
      password: account.password,
      email_confirm: true,
      user_metadata: {
        name: account.name,
        role: account.role,
      },
    })
    if (error) throw new Error(`Failed to update auth user for ${account.email}: ${error.message}`)
    console.log(`Updated: ${account.email} (${account.role})`)
  }

  const { error: profileError } = await supabase.from('profiles').upsert(
    {
      id: userId,
      name: account.name,
      email: account.email,
      role: account.role,
    },
    { onConflict: 'id' },
  )

  if (profileError) {
    throw new Error(`Failed to seed profile for ${account.email}: ${profileError.message}`)
  }
}

async function main() {
  let failed = 0
  for (const account of accounts) {
    try {
      await seedAccount(account)
    } catch (err) {
      failed += 1
      console.error(`ERROR ${account.email}: ${err.message}`)
    }
  }

  if (failed > 0) {
    console.error(`Finished with ${failed} error(s).`)
    process.exit(1)
  }

  console.log('Bulk seed completed successfully.')
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
