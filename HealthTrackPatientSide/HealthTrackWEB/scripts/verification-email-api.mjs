/**
 * Local/production helper API to send verification codes via Resend.
 * Use when Edge Functions are not deployed yet.
 *
 * 1. Ensure you have the following in HealthTrackWEB/.env:
 *    VITE_RESEND_API_KEY=re_...
 *    VITE_RESEND_FROM="HealthTrack RHU <onboarding@resend.dev>"
 *
 * 2. Add to HealthTrackPatientSide/.env:
 *    VITE_VERIFICATION_EMAIL_API=http://localhost:8788/send
 *
 * 3. Run: npm run verification:email-api
 */
import { createServer } from 'node:http'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { resolve } from 'node:path'

dotenv.config({ path: resolve(process.cwd(), '.env'), quiet: true })
dotenv.config({ path: resolve(process.cwd(), '.env.seed'), quiet: true })

const PORT = Number(process.env.VERIFICATION_EMAIL_PORT || 8788)
const supabaseUrl = process.env.SUPABASE_URL
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const resendApiKey = process.env.VITE_RESEND_API_KEY || process.env.RESEND_API_KEY
const resendFrom = process.env.VITE_RESEND_FROM || process.env.RESEND_FROM || 'HealthTrack RHU <onboarding@resend.dev>'

if (!supabaseUrl || !serviceRoleKey || !supabaseAnonKey) {
  console.error('Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or SUPABASE_ANON_KEY in .env.seed')
  process.exit(1)
}

if (!resendApiKey) {
  console.error('Missing VITE_RESEND_API_KEY in .env')
  console.error('Sign up at resend.com for a free API key.')
  process.exit(1)
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function readJson(req) {
  return new Promise((resolvePromise, reject) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
    })
    req.on('end', () => {
      try {
        resolvePromise(raw ? JSON.parse(raw) : {})
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

async function sendVerificationEmail({ userId, destination }) {
  const { data: code, error } = await admin.rpc('create_pending_verification', {
    p_user_id: userId,
    p_method: 'email',
    p_destination: destination,
  })

  if (error) throw new Error(error.message)

  const from = resendFrom.includes('<') ? resendFrom : `HealthTrack RHU <${resendFrom}>`

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [destination],
      subject: 'Your HealthTrack verification code',
      text: `Your HealthTrack verification code is ${code}. It expires in 10 minutes.`,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.5;color:#1b2a3a">
          <h2 style="margin:0 0 12px">Verify your HealthTrack account</h2>
          <p>Your 6-digit code:</p>
          <p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p>
          <p style="color:#64748b;font-size:14px">Expires in 10 minutes.</p>
        </div>
      `,
    }),
  })

  const text = await res.text().catch(() => '')
  if (!res.ok) {
    throw new Error(`Resend API error (${res.status}): ${text}`)
  }

  return { ok: true }
}

const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (req.method !== 'POST' || (req.url !== '/send' && req.url !== '/notify')) {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: false, error: 'Not found' }))
    return
  }

  try {
    const body = await readJson(req)
    const destination = (body.destination || '').trim()
    let userId = body.userId || ''

    const authHeader = req.headers.authorization || ''
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()

    if (token) {
      const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      })
      const {
        data: { user },
        error: userError,
      } = await userClient.auth.getUser(token)

      if (userError || !user) {
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'Unauthorized.' }))
        return
      }

      userId = user.id
      if (body.userId && body.userId !== user.id) {
        res.writeHead(403, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'Invalid user reference.' }))
        return
      }
    } else if (userId && destination) {
      const { data: authUser, error: lookupError } = await admin.auth.admin.getUserById(userId)
      if (lookupError || !authUser?.user) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'Account not found.' }))
        return
      }
      const accountEmail = (authUser.user.email ?? '').trim().toLowerCase()
      if (accountEmail !== destination.toLowerCase()) {
        res.writeHead(403, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: 'Email does not match this account.' }))
        return
      }
    } else {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: 'Missing authorization or account details.' }))
      return
    }

    if (req.url === '/notify') {
      const from = resendFrom.includes('<') ? resendFrom : `HealthTrack RHU <${resendFrom}>`
      
      let resendRes;
      let textRes = '';
      try {
        resendRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from,
            to: Array.isArray(body.to) ? body.to : [body.to],
            subject: body.subject,
            text: body.text,
            html: body.html,
          }),
        })

        textRes = await resendRes.text().catch(() => '')
        if (!resendRes.ok) {
          throw new Error(`Resend API error (${resendRes.status}): ${textRes}`)
        }
      } catch (err) {
        // Log failure to database
        if (body.logData) {
          const { error: dbError } = await admin.from('email_logs').insert([{
            appointment_id: body.logData.appointmentId ?? null,
            queue_id: body.logData.queueId ?? null,
            patient_id: body.logData.patientId ?? null,
            recipient_email: body.logData.to ?? '',
            message: body.logData.message ?? '',
            status: 'failed',
            provider_response: String(err.message).slice(0, 2000),
          }])
          if (dbError) console.error('[Email] Failed to write to email_logs:', dbError.message)
        }
        throw err;
      }

      // Log success to database
      if (body.logData) {
        const { error: dbError } = await admin.from('email_logs').insert([{
          appointment_id: body.logData.appointmentId ?? null,
          queue_id: body.logData.queueId ?? null,
          patient_id: body.logData.patientId ?? null,
          recipient_email: body.logData.to ?? '',
          message: body.logData.message ?? '',
          status: 'sent',
          provider_response: String(textRes).slice(0, 2000),
        }])
        if (dbError) console.error('[Email] Failed to write to email_logs:', dbError.message)
      }

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
      return
    }

    const result = await sendVerificationEmail({ userId, destination })
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(result))
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: false, error: error.message || 'Failed to send email.' }))
  }
})

server.listen(PORT, () => {
  console.log(`Verification email API listening on http://localhost:${PORT}`)
  console.log('POST /send with Authorization: Bearer <patient access token>')
})
