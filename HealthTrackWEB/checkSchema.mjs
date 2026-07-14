import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config()

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

async function test() {
  const { data, error } = await supabase
    .from('service_requests')
    .select('*')
    .limit(1)
  
  console.log('Columns in service_requests:', Object.keys(data?.[0] || {}))
}

test()
