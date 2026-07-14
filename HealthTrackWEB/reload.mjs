import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config()

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

async function test() {
  const { error } = await supabase.rpc('reload_schema', {}) // If there's an rpc for it, else I will just run a raw query via postgres driver.
  console.log('Tried RPC', error)
}

test()
