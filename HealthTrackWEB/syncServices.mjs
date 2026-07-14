import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config()

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

async function sync() {
  // 1. Get all unique services from appointments
  const { data: appointments } = await supabase.from('appointments').select('id, service')
  
  if (!appointments) return console.log('No appointments found.')

  const uniqueServices = [...new Set(appointments.map(a => a.service).filter(Boolean))]

  for (const srvName of uniqueServices) {
    // 2. Ensure service exists in services table
    const { data: existingService } = await supabase.from('services').select('id').eq('name', srvName).maybeSingle()
    
    let serviceId = existingService?.id

    if (!serviceId) {
      // Insert new service
      const prefix = srvName.split(' ').map(w => w[0]).join('').substring(0, 3).toUpperCase()
      const { data: newSrv } = await supabase.from('services').insert({
        name: srvName,
        queue_prefix: prefix,
        estimated_duration_mins: 15
      }).select('id').single()
      
      serviceId = newSrv?.id
      console.log(`Inserted service: ${srvName} (${serviceId})`)
    }

    // 3. Update service_requests that are linked to these appointments
    if (serviceId) {
      const apptIds = appointments.filter(a => a.service === srvName).map(a => a.id)
      
      if (apptIds.length > 0) {
        // We can't use 'in' on a large array efficiently without an RPC or admin key sometimes,
        // but for small datasets it's fine.
        const { error } = await supabase
          .from('service_requests')
          .update({ service_id: serviceId })
          .in('appointment_id', apptIds)
          
        if (error) console.error(`Error updating requests for ${srvName}:`, error)
        else console.log(`Synced service_requests for ${srvName}`)
      }
    }
  }

  console.log('Sync complete!')
}

sync()
