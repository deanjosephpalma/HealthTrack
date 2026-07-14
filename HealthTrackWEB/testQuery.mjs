import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config()

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

async function test() {
  const id = '7e6d2228-f147-4154-ba07-bd57366e6edb'
  const { data, error } = await supabase
    .from('service_requests')
    .select('*, services(*)')
    .eq('id', id)
    .single()
  
  console.log({ data, error })
}

test()
