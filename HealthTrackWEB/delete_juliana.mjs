import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

const seedEnvPath = path.resolve(process.cwd(), '.env.seed')
let supabaseUrl = ''
let serviceRoleKey = ''

if (fs.existsSync(seedEnvPath)) {
  const content = fs.readFileSync(seedEnvPath, 'utf-8')
  const urlMatch = content.match(/SUPABASE_URL=(.*)/)
  const keyMatch = content.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)
  if (urlMatch) supabaseUrl = urlMatch[1].trim()
  if (keyMatch) serviceRoleKey = keyMatch[1].trim()
}

if (!supabaseUrl || !serviceRoleKey) {
  dotenv.config()
  supabaseUrl = process.env.VITE_SUPABASE_URL
  serviceRoleKey = process.env.VITE_SUPABASE_ANON_KEY
}

supabaseUrl = supabaseUrl.replace(/^['"]|['"]$/g, '')
serviceRoleKey = serviceRoleKey.replace(/^['"]|['"]$/g, '')

const supabase = createClient(supabaseUrl, serviceRoleKey)

async function run() {
  console.log('Searching for patient matching "Juliana%Lat"...')
  const { data: patients, error: pErr } = await supabase
    .from('patients')
    .select('id, name')
    .ilike('name', '%Juliana%Lat%')

  if (pErr) {
    console.error('Error fetching patients:', pErr)
    return
  }

  if (!patients || patients.length === 0) {
    console.log('No patient found matching Juliana Lat.')
    return
  }

  console.log('Found patients:', patients)

  for (const patient of patients) {
    console.log(`Deleting clinical records for patient ID: ${patient.id} (${patient.name})...`)
    const { error: recErr } = await supabase
      .from('patient_records')
      .delete()
      .eq('patient_id', patient.id)

    if (recErr) {
      console.error(`Error deleting patient records for ${patient.name}:`, recErr)
    }

    console.log(`Deleting patient row for patient ID: ${patient.id}...`)
    const { error: patDelErr } = await supabase
      .from('patients')
      .delete()
      .eq('id', patient.id)

    if (patDelErr) {
      console.error(`Error deleting patient row for ${patient.name}:`, patDelErr)
    } else {
      console.log(`Successfully deleted ${patient.name} and all linked records!`)
    }
  }
}

run()
