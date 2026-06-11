const mailConfig = require('../config/mailConfig');
const twilioConfig = require('../config/twilioConfig');
const db = require('../config/dbConfig');
const { generateOtp } = require('../services/otpService');
const transporter = require('../services/emailService');
const twilioClient = require('../services/smsService');

const emailOtpStore = {};

async function queryOne(sql, params = []) {
  const result = await db.query(sql, params);
  return result.rows[0] || null;
}

function otpSuccessResponse(message, otp) {
  const response = { success: true, message };
  if (process.env.NODE_ENV !== 'production') response.devOtp = otp;
  return response;
}

async function sendOtp(req, res, next) {
  try {
    const { type, value, empId, password } = req.body;
    if (!type || !value) {
      return res.status(400).json({ success: false, message: 'Type and value required.' });
    }

    if (empId || password) {
      const emp = await queryOne('SELECT * FROM employees WHERE emp_id = $1', [empId]);
      if (!emp) return res.status(400).json({ success: false, message: 'Employee ID not found.' });
      if (emp.password !== password) return res.status(400).json({ success: false, message: 'Incorrect password.' });
      if (type === 'phone' && emp.mobile && emp.mobile !== value) return res.status(400).json({ success: false, message: 'Mobile number does not match this employee.' });
      if (type === 'email' && emp.email && emp.email !== value) return res.status(400).json({ success: false, message: 'Email does not match this employee.' });
    }

    if (type === 'phone') {
      if (!/^\d{10}$/.test(value)) return res.status(400).json({ success: false, message: 'Enter valid 10-digit mobile.' });
      if (!twilioClient || !twilioConfig.verifyServiceSid) return res.status(400).json({ success: false, message: 'SMS not configured. Please use Email OTP instead.' });
      await twilioClient.verify.v2.services(twilioConfig.verifyServiceSid).verifications.create({ to: `+91${value}`, channel: 'sms' });
      return res.json({ success: true, message: 'OTP sent to mobile.' });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return res.status(400).json({ success: false, message: 'Enter valid email.' });

    const otp = generateOtp();
    emailOtpStore[value] = { otp, expiresAt: Date.now() + 2 * 60 * 1000 };
    console.log(`Email OTP for ${value}: ${otp}`);

    if (!mailConfig.gmailUser || !mailConfig.gmailPass) {
      return res.json(otpSuccessResponse('OTP generated. Email is not configured, so check the backend console.', otp));
    }

    try {
      await transporter.sendMail({
        from: `"RINL Wage Portal" <${mailConfig.gmailUser}>`,
        to: value,
        subject: 'RINL Wage Portal OTP Verification',
        html: `<p>Your RINL Wage Portal OTP is <strong>${otp}</strong>. It is valid for 2 minutes.</p>`
      });
      return res.json(otpSuccessResponse('OTP sent to email.', otp));
    } catch (mailErr) {
      console.error('Email send failed:', mailErr.message);
      if (process.env.NODE_ENV !== 'production') {
        return res.json(otpSuccessResponse('Email sending failed, but OTP was generated. Check the backend console.', otp));
      }
      throw mailErr;
    }
  } catch (err) {
    next(err);
  }
}

async function verifyOtp(req, res, next) {
  try {
    const { type, value, otp, empId, role } = req.body;
    if (!type || !value || !otp) return res.status(400).json({ success: false, message: 'All fields required.' });

    let verified = false;
    if (type === 'phone') {
      if (!twilioClient || !twilioConfig.verifyServiceSid) return res.status(400).json({ success: false, message: 'SMS not configured. Use Email OTP.' });
      const result = await twilioClient.verify.v2.services(twilioConfig.verifyServiceSid).verificationChecks.create({ to: `+91${value}`, code: otp });
      verified = result.status === 'approved';
    } else {
      const record = emailOtpStore[value];
      if (!record) return res.status(400).json({ success: false, message: 'OTP not found. Request a new one.' });
      if (Date.now() > record.expiresAt) {
        delete emailOtpStore[value];
        return res.status(400).json({ success: false, message: 'OTP expired.' });
      }
      verified = record.otp === otp;
      if (verified) delete emailOtpStore[value];
    }

    if (!verified) return res.status(400).json({ success: false, message: 'Invalid OTP. Try again.' });

    const emp = empId ? await queryOne('SELECT * FROM employees WHERE emp_id = $1', [empId]) : null;
    const loginRole = role || (emp ? emp.role : 'User');
    const loginName = emp ? emp.name : empId || value;
    const loginEmpId = empId || value;

    const session = await queryOne(
      `INSERT INTO login_sessions (emp_id, name, role, ip_address, status)
       VALUES ($1, $2, $3, $4, 'active')
       RETURNING id`,
      [loginEmpId, loginName, loginRole, req.ip]
    );

    await db.query(
      `INSERT INTO login_logs (emp_id, name, role, action, ip_address)
       VALUES ($1, $2, $3, 'LOGIN', $4)`,
      [loginEmpId, loginName, loginRole, req.ip]
    );

    return res.json({
      success: true,
      message: 'Login successful.',
      sessionId: session.id,
      employee: emp ? { name: emp.name, role: emp.role, empId: emp.emp_id } : { name: loginName, role: loginRole, empId: loginEmpId }
    });
  } catch (err) {
    next(err);
  }
}

async function logout(req, res, next) {
  try {
    const { sessionId, empId, role } = req.body;
    if (sessionId) {
      await db.query("UPDATE login_sessions SET status = 'inactive', logout_time = CURRENT_TIMESTAMP WHERE id = $1", [sessionId]);
    }
    await db.query(
      `INSERT INTO login_logs (emp_id, role, action, ip_address)
       VALUES ($1, $2, 'LOGOUT', $3)`,
      [empId || 'unknown', role || 'unknown', req.ip]
    );
    return res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { sendOtp, verifyOtp, logout };
