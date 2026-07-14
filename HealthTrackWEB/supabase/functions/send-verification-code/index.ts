import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type Payload = {
  userId?: string
  method?: string
  destination?: string
}

async function sendWithResend(to: string, code: string) {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('RESEND_FROM') || 'HealthTrack RHU <onboarding@resend.dev>'

  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured on Supabase Edge Functions.')
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: 'Your HealthTrack verification code',
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.5;color:#1b2a3a">
          <h2 style="margin:0 0 12px">Verify your HealthTrack account</h2>
          <p>Use this 6-digit code to activate your patient portal account:</p>
          <p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:16px 0">${code}</p>
          <p style="color:#64748b;font-size:14px">This code expires in 10 minutes. If you did not register, you can ignore this email.</p>
          <p style="color:#64748b;font-size:14px">Rural Health Unit of Pila</p>
        </div>
      `,
      text: `Your HealthTrack verification code is ${code}. It expires in 10 minutes.`,
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Resend error (${response.status}): ${body}`)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      throw new Error('Missing Supabase environment variables in the edge function.')
    }

    const body = (await req.json()) as Payload
    const method = (body.method || 'email').toLowerCase()
    const destination = (body.destination || '').trim()
    const requestedUserId = body.userId || ''

    const admin = createClient(supabaseUrl, serviceRoleKey)
    const authHeader = req.headers.get('Authorization')
    let userId = requestedUserId

    if (authHeader) {
      const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      })
      const {
        data: { user },
        error: userError,
      } = await userClient.auth.getUser()

      if (userError || !user) {
        return new Response(JSON.stringify({ ok: false, error: 'Unauthorized.' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      userId = user.id
      if (requestedUserId && requestedUserId !== user.id) {
        return new Response(JSON.stringify({ ok: false, error: 'Invalid user reference.' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    } else if (requestedUserId && destination) {
      const { data: authUser, error: lookupError } = await admin.auth.admin.getUserById(requestedUserId)
      if (lookupError || !authUser?.user) {
        return new Response(JSON.stringify({ ok: false, error: 'Account not found.' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const accountEmail = (authUser.user.email ?? '').trim().toLowerCase()
      if (accountEmail !== destination.toLowerCase()) {
        return new Response(JSON.stringify({ ok: false, error: 'Email does not match this account.' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      userId = requestedUserId
    } else {
      return new Response(JSON.stringify({ ok: false, error: 'Missing authorization or account details.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (method !== 'email') {
      return new Response(JSON.stringify({ ok: false, error: 'Only email delivery is configured.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!destination) {
      return new Response(JSON.stringify({ ok: false, error: 'Email destination is required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: code, error: rpcError } = await admin.rpc('create_pending_verification', {
      p_user_id: userId,
      p_method: 'email',
      p_destination: destination,
    })

    if (rpcError) {
      throw new Error(rpcError.message)
    }

    if (!code) {
      throw new Error('Verification code was not created.')
    }

    await sendWithResend(destination, String(code))

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send verification email.'
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
