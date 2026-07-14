/* Example: create a pending verification via Supabase RPC and send code via Nodemailer/Twilio

Set env:
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
  SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
  TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM

Install (project root):
  npm install nodemailer twilio node-fetch

Run:
  node scripts/send-verification-example.mjs
*/

import fetch from 'node-fetch'
import nodemailer from 'nodemailer'
import Twilio from 'twilio'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

async function createPendingVerification(userId, method, destination) {
  const resp = await fetch(`${SUPABASE_URL}/rpc/create_pending_verification`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
    body: JSON.stringify({ p_user_id: userId, p_method: method, p_destination: destination }),
  })
  const data = await resp.json()
  if (!resp.ok) throw new Error(JSON.stringify(data))
  return data
}

async function sendEmail(destination, code) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })

  await transporter.sendMail({
    from: process.env.SMTP_FROM || 'no-reply@example.com',
    to: destination,
    subject: 'Your verification code',
    text: `Your verification code is: ${code}`,
  })
}

async function sendSms(destination, code) {
  const client = Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  await client.messages.create({ body: `Your verification code is: ${code}`, from: process.env.TWILIO_FROM, to: destination })
}

async function main() {
  const userId = process.env.TEST_USER_ID || '00000000-0000-0000-0000-000000000000'
  const email = process.env.TEST_EMAIL || 'test@example.com'
  const phone = process.env.TEST_PHONE || '+639171234567'

  // Email
  const emailCode = await createPendingVerification(userId, 'email', email)
  console.log('Email code (returned by RPC):', emailCode)
  try {
    await sendEmail(email, emailCode)
    console.log('Sent email')
  } catch (err) {
    console.error('Failed to send email:', err.message)
  }

  // SMS
  const smsCode = await createPendingVerification(userId, 'sms', phone)
  console.log('SMS code (returned by RPC):', smsCode)
  try {
    await sendSms(phone, smsCode)
    console.log('Sent SMS')
  } catch (err) {
    console.error('Failed to send SMS:', err.message)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
