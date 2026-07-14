/* global process */
import nodemailer from 'nodemailer';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import http from 'http';

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = process.env.SMTP_PORT || 587;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || 'HealthTrack RHU Pila <healthtrackrhupila@gmail.com>';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

// Create Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Create transporter
const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: false, // true for 465, false for other ports
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
});

// Verify transporter configuration
transporter.verify((error) => {
  if (error) {
    console.error('SMTP configuration error:', error);
  } else {
    console.log('SMTP server is ready to send emails');
  }
});

// Simple HTTP server to handle email sending requests
const server = http.createServer(async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/send') {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const { userId, method, destination } = JSON.parse(body);

        if (!destination) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing destination email' }));
          return;
        }

        if (!userId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing userId' }));
          return;
        }

        // Generate verification code using Supabase RPC
        const { data: code, error: rpcError } = await supabase.rpc('create_pending_verification', {
          p_user_id: userId,
          p_method: method || 'email',
          p_destination: destination,
        });

        if (rpcError) {
          console.error('Error generating verification code:', rpcError);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Could not generate verification code: ${rpcError.message}` }));
          return;
        }

        if (!code) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Verification code was not created' }));
          return;
        }

        const mailOptions = {
          from: SMTP_FROM,
          to: destination,
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
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('Email sent:', info.messageId);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (error) {
        console.error('Error sending email:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

const PORT = 8788;
server.listen(PORT, () => {
  console.log(`SMTP server running on http://localhost:${PORT}`);
});
