// ═══════════════════════════════════════════════════════
//  RINL Wage Portal — OTP Backend Server (Node.js)
//  File: server.js
//
//  Uses: Twilio Verify (SMS) + Nodemailer (Email)
//  Run:  npm install
//        node server.js
// ═══════════════════════════════════════════════════════

const express    = require('express');
const cors       = require('cors');
const twilio     = require('twilio');
const nodemailer = require('nodemailer');
const path       = require('path');

const app = express();

// ── CONFIG — Fill in your credentials ───────────────────
const CONFIG = {
  port: 3000,

  // TWILIO VERIFY — https://www.twilio.com
  // No physical phone number needed, just Verify Service.
 
  twilio: {
    accountSid: "YOUR_TWILIO_ACCOUNT_SID",
    authToken: "YOUR_TWILIO_AUTH_TOKEN",
    verifyServiceSid: "YOUR_VERIFY_SERVICE_SID"
},
 

  // NODEMAILER — uses Gmail SMTP
  email: {
    gmailUser: 'YOUR_GMAIL@gmail.com',
    gmailPass: 'YOUR_GMAIL_APP_PASSWORD'
    // To generate App Password:
    //   Google Account → Security → 2-Step Verification → App Passwords
  }
};
// ────────────────────────────────────────────────────────

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));  // Serves index.html, styles.css, app.js

// Twilio client
const twilioClient = twilio(CONFIG.twilio.accountSid, CONFIG.twilio.authToken);

// Nodemailer transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: CONFIG.email.gmailUser,
    pass: CONFIG.email.gmailPass
  }
});

// In-memory OTP store (email only — Twilio manages SMS OTPs internally)
const emailOtpStore = {};

/**
 * Generate a random 6-digit OTP string.
 */
function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ════════════════════════════════════════════════════════
//  POST /send-otp
//  Body: { type: 'phone' | 'email', value: '...' }
//
//  Sends OTP via SMS (Twilio Verify) or Email (Nodemailer).
// ════════════════════════════════════════════════════════
app.post('/send-otp', async (req, res) => {
  const { type, value } = req.body;

  if (!type || !value) {
    return res.status(400).json({ success: false, message: 'Type and value are required.' });
  }

  // ── SMS via Twilio Verify ────────────────────────────
  if (type === 'phone') {
    if (!/^\d{10}$/.test(value)) {
      return res.status(400).json({ success: false, message: 'Enter a valid 10-digit mobile number.' });
    }
    try {
      await twilioClient.verify.v2
        .services(CONFIG.twilio.verifyServiceSid)
        .verifications
        .create({ to: `+91${value}`, channel: 'sms' });

      console.log(`[SMS] OTP sent to +91${value} via Twilio Verify`);
      return res.json({ success: true, message: 'OTP sent to your mobile number.' });

    } catch (err) {
      console.error('[SMS] Twilio error:', err.message);
      return res.status(500).json({ success: false, message: `SMS Error: ${err.message}` });
    }
  }

  // ── Email via Nodemailer ─────────────────────────────
  if (type === 'email') {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      return res.status(400).json({ success: false, message: 'Enter a valid email address.' });
    }

    const otp = generateOtp();
    emailOtpStore[value] = { otp, expiresAt: Date.now() + 2 * 60 * 1000 };  // 2-minute expiry
    console.log(`[Email] OTP for ${value}: ${otp}`);

    try {
      await transporter.sendMail({
        from:    `"RINL Wage Portal" <${CONFIG.email.gmailUser}>`,
        to:      value,
        subject: 'RINL Wage Portal — OTP Verification',
        html: `
          <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;">
            <div style="background:#003f8a;padding:20px;text-align:center;">
              <h2 style="color:#fff;margin:0;">RINL Wage Portal</h2>
              <p style="color:#aac4f0;margin:5px 0 0;">Rashtriya Ispat Nigam Limited · Vizag Steel</p>
            </div>
            <div style="padding:30px;background:#f4f7fc;border:1px solid #dde3ed;">
              <p style="color:#333;">Dear User,</p>
              <p style="color:#555;">Your One Time Password (OTP) for RINL Wage Portal login is:</p>
              <div style="text-align:center;margin:25px 0;">
                <span style="font-size:36px;font-weight:bold;letter-spacing:10px;color:#003f8a;
                  background:#fff;padding:15px 25px;border-radius:8px;border:2px dashed #003f8a;">
                  ${otp}
                </span>
              </div>
              <p style="color:#555;">This OTP is valid for <strong>2 minutes</strong>. Do not share it with anyone.</p>
              <hr style="border:none;border-top:1px solid #dde3ed;margin:20px 0;">
              <p style="color:#999;font-size:12px;">
                This is an automated message from RINL IT Department.<br>
                Support: 0891-2518000
              </p>
            </div>
            <div style="background:#003f8a;padding:10px;text-align:center;">
              <p style="color:#aac4f0;font-size:11px;margin:0;">
                © 2026 Rashtriya Ispat Nigam Limited (RINL) – Visakhapatnam Steel Plant
              </p>
            </div>
          </div>
        `
      });

      return res.json({ success: true, message: 'OTP sent to your email address.' });

    } catch (err) {
      console.error('[Email] Nodemailer error:', err.message);
      return res.status(500).json({ success: false, message: `Email Error: ${err.message}` });
    }
  }

  return res.status(400).json({ success: false, message: 'Invalid type. Use "phone" or "email".' });
});

// ════════════════════════════════════════════════════════
//  POST /verify-otp
//  Body: { type: 'phone' | 'email', value: '...', otp: '123456' }
//
//  Verifies OTP — Twilio handles SMS, in-memory store for email.
// ════════════════════════════════════════════════════════
app.post('/verify-otp', async (req, res) => {
  const { type, value, otp } = req.body;

  if (!type || !value || !otp) {
    return res.status(400).json({ success: false, message: 'All fields are required.' });
  }

  // ── Verify SMS OTP via Twilio ────────────────────────
  if (type === 'phone') {
    try {
      const result = await twilioClient.verify.v2
        .services(CONFIG.twilio.verifyServiceSid)
        .verificationChecks
        .create({ to: `+91${value}`, code: otp });

      if (result.status === 'approved') {
        console.log(`[SMS] OTP approved for +91${value}`);
        return res.json({ success: true, message: 'OTP verified successfully.' });
      } else {
        return res.status(400).json({ success: false, message: 'Invalid OTP. Please try again.' });
      }
    } catch (err) {
      console.error('[SMS] Twilio verify error:', err.message);
      return res.status(500).json({ success: false, message: `Verification Error: ${err.message}` });
    }
  }

  // ── Verify Email OTP from in-memory store ────────────
  if (type === 'email') {
    const record = emailOtpStore[value];

    if (!record) {
      return res.status(400).json({ success: false, message: 'OTP not found. Please request a new one.' });
    }
    if (Date.now() > record.expiresAt) {
      delete emailOtpStore[value];
      return res.status(400).json({ success: false, message: 'OTP expired. Please request a new one.' });
    }
    if (record.otp !== otp) {
      return res.status(400).json({ success: false, message: 'Invalid OTP. Please try again.' });
    }

    delete emailOtpStore[value];  // One-time use
    console.log(`[Email] OTP verified for ${value}`);
    return res.json({ success: true, message: 'OTP verified successfully.' });
  }

  return res.status(400).json({ success: false, message: 'Invalid type. Use "phone" or "email".' });
});

// ── Start Server ─────────────────────────────────────────
app.listen(CONFIG.port, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   RINL Wage Portal — OTP Server          ║');
  console.log(`║   Running at http://localhost:${CONFIG.port}       ║`);
  console.log('║   Open the URL above in your browser     ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');
});