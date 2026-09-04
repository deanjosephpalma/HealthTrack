/**
 * Provision Doctor/Nurse staff accounts via Supabase SERVICE ROLE only.
 * Do NOT create staff profiles from the browser — RLS blocks self-insert after hardening.
 *
 * Usage (from HealthTrackWEB):
 *   npm run seed:accounts
 *
 * Requires .env.seed with SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 */
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { resolve } from 'node:path'

const envCandidates = [
  resolve(process.cwd(), '.env.seed'),
]

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
  if (parts.length !== 3) {
    return null
  }

  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'))
  } catch {
    return null
  }
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

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

const defaultAccounts = [
  {
    email: 'docviel@healthtrack.com',
    password: 'rhupila',
    role: 'Doctor',
    name: 'Dr. Viel',
  },
  {
    email: 'johnwilfred.reyes@healthtrack.com',
    password: 'rhupila',
    role: 'Nurse',
    name: 'John Wilfred Reyes, RN',
  },
  {
    email: 'antonette.alcos@healthtrack.com',
    password: 'rhupila',
    role: 'Nurse',
    name: 'Antonette Alcos, RN',
  },
  {
    email: 'angelajoselle.devandera@healthtrack.com',
    password: 'rhupila',
    role: 'Nurse',
    name: 'Angela Joselle Devandera, RN',
  },
  {
    email: 'zuleika.jacosalem@healthtrack.com',
    password: 'rhupila',
    role: 'Nurse',
    name: 'Zuleika Jacosalem, RN',
  },
  {
    email: 'gezzamin.basarte@healthtrack.com',
    password: 'rhupila',
    role: 'Nurse',
    name: 'Gezzamin Basarte, RMT',
  },
  {
    email: 'kennethjosephnico.supena@healthtrack.com',
    password: 'rhupila',
    role: 'Nurse',
    name: 'Kenneth Joseph Nico Supeña, RMT',
  },
  {
    email: 'floredima.malubay@healthtrack.com',
    password: 'rhupila',
    role: 'Nurse',
    name: 'Floredima Malubay, RM',
  },
  {
    email: 'luisa.barabas@healthtrack.com',
    password: 'rhupila',
    role: 'Nurse',
    name: 'Luisa Barabas, RM',
  },
  {
    email: 'maureen.balmes@healthtrack.com',
    password: 'rhupila',
    role: 'Nurse',
    name: 'Maureen Balmes, RM',
  },
  {
    email: 'mariecharmaine.forton@healthtrack.com',
    password: 'rhupila',
    role: 'Nurse',
    name: 'Marie Charmaine Forton, RM',
  },
  {
    email: 'babydina.deleon@healthtrack.com',
    password: 'rhupila',
    role: 'Nurse',
    name: 'Baby Dina de Leon, RM',
  },
  {
    email: 'liza.panggat@healthtrack.com',
    password: 'rhupila',
    role: 'Nurse',
    name: 'Liza Panggat, RM',
  },
  {
    email: 'josephine.ravelas@healthtrack.com',
    password: 'rhupila',
    role: 'Nurse',
    name: 'Josephine Ravelas, RM',
  },
  {
    email: 'rosalinda.malimutin@healthtrack.com',
    password: 'rhupila',
    role: 'Nurse',
    name: 'Rosalinda Malimutin, RM',
  },
  {
    email: 'sherryl.suero@healthtrack.com',
    password: 'rhupila',
    role: 'Nurse',
    name: 'Sherryl Suero, RM',
  },
  {
    email: 'alma.divinagracia@healthtrack.com',
    password: 'rhupila',
    role: 'Nurse',
    name: 'Alma Divinagracia',
  },
  {
    email: 'bhw.pila@healthtrack.com',
    password: 'rhupila',
    role: 'BHW',
    name: 'Sample BHW Encoder',
  },
  {
    email: 'volunteer.pila@healthtrack.com',
    password: 'rhupila',
    role: 'Volunteer',
    name: 'Sample Volunteer Encoder',
  },
]

async function findExistingUserByEmail(email) {
  const { data, error } = await supabase.auth.admin.listUsers()

  if (error) {
    throw new Error(`Failed to list auth users: ${error.message}`)
  }

  return data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase()) ?? null
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

    if (error) {
      throw new Error(`Failed to create auth user for ${account.email}: ${error.message}`)
    }

    userId = data.user.id
    console.log(`Created auth user: ${account.email}`)
  } else {
    const { error } = await supabase.auth.admin.updateUserById(userId, {
      password: account.password,
      email_confirm: true,
      user_metadata: {
        name: account.name,
        role: account.role,
      },
    })

    if (error) {
      throw new Error(`Failed to update auth user for ${account.email}: ${error.message}`)
    }

    console.log(`Updated auth user: ${account.email}`)
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

  const { error: vaultError } = await supabase.from('account_password_vault').upsert(
    {
      user_id: userId,
      password_plain: account.password,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  )

  if (vaultError) {
    console.warn(`Password vault sync skipped for ${account.email}: ${vaultError.message}`)
  }

  console.log(`Synced profile: ${account.email} (${account.role})`)
}

async function main() {
  for (const account of defaultAccounts) {
    await seedAccount(account)
  }

  console.log('Seed completed successfully.')
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
