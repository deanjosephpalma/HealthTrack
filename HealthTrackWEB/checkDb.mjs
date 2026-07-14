import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config()

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

async function test() {
  const { data: sr } = await supabase.from('service_requests').select('*').limit(5)
  console.log('service_requests:', sr)

  const { data: services } = await supabase.from('services').select('*').limit(5)
  console.log('services:', services)

  const { data: steps } = await supabase.from('workflow_steps').select('*').limit(5)
  console.log('workflow_steps:', steps)
}

test()
