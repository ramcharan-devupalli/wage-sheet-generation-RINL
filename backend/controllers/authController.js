const mailConfig = require('../config/mailConfig');
const twilioConfig = require('../config/twilioConfig');
const db = require('../config/dbConfig');
const { generateOtp } = require('../services/otpService');
const transporter = require('../services/emailService');
const twilioClient = require('../services/smsService');
const { UAParser } = require('ua-parser-js');

const otpStore = {};
const OTP_PROVIDER_TIMEOUT_MS = Number(process.env.OTP_PROVIDER_TIMEOUT_MS || 15000);
const OTP_TTL_MS = 2 * 60 * 1000;
const ENABLE_LOCAL_OTP_FALLBACK = process.env.ENABLE_LOCAL_OTP_FALLBACK === 'true';

async function queryOne(sql, params = []) {
  const result = await db.query(sql, params);
  return result.rows[0] || null;
}

function normalizeRole(role) {
  return String(role || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function rolesMatch(left, right) {
  const a = normalizeRole(left);
  const b = normalizeRole(right);
  if (!a || !b) return true;
  if (a === b) return true;
  const workerRoles = ['worker', 'workers', 'skilled worker', 'skilled labor', 'semi skilled worker', 'semi skilled labor', 'unskilled worker', 'unskilled labor'];
  if (workerRoles.includes(a) && workerRoles.includes(b)) return true;
  if (['contractor', 'contractor representative'].includes(a) && ['contractor', 'contractor representative'].includes(b)) return true;
  if (['engineer', 'engineer incharge', 'engineer in charge'].includes(a) && ['engineer', 'engineer incharge', 'engineer in charge'].includes(b)) return true;
  if (['supervisor', 'shift supervisor'].includes(a) && ['supervisor', 'shift supervisor'].includes(b)) return true;
  if (['admin', 'hr admin', 'hr / admin'].includes(a) && ['admin', 'hr admin', 'hr / admin'].includes(b)) return true;
  return false;
}

function isAdminRole(role) {
  return ['admin', 'hr admin', 'hr / admin'].includes(normalizeRole(role));
}

function isEngineerRole(role) {
  return ['engineer', 'engineer incharge', 'engineer in charge'].includes(normalizeRole(role));
}

function isSupervisorRole(role) {
  return ['supervisor', 'shift supervisor'].includes(normalizeRole(role));
}

function isContractorRole(role) {
  return ['contractor', 'contractor representative'].includes(normalizeRole(role));
}

function isWorkerRole(role) {
  return [
    'worker',
    'workers',
    'skilled worker',
    'skilled labor',
    'semi skilled worker',
    'semi skilled labor',
    'unskilled worker',
    'unskilled labor'
  ].includes(normalizeRole(role));
}

function otpSuccessResponse(message, otp, options = {}) {
  const response = { success: true, message };
  return response;
}

function otpStoreKey(type, value) {
  return `${type}:${value}`;
}

function normalizedOtpValue(type, value) {
  return type === 'email' ? String(value || '').trim().toLowerCase() : String(value || '').trim();
}

function storeLocalOtp(type, value, otp = generateOtp()) {
  const normalizedValue = normalizedOtpValue(type, value);
  otpStore[otpStoreKey(type, normalizedValue)] = { otp, expiresAt: Date.now() + OTP_TTL_MS };
  return { otp, normalizedValue };
}

function localOtpFallbackResponse(type, value, reason, existingOtp = '') {
  if (!ENABLE_LOCAL_OTP_FALLBACK) return null;
  const { otp } = storeLocalOtp(type, value, existingOtp || undefined);
  console.warn(`Using local ${type} OTP fallback:`, reason);
  return {
    success: true,
    fallback: true,
    devOtp: otp,
    message: `Delivery service is slow/unavailable, so a local development OTP was generated. Use OTP ${otp}.`
  };
}

function mapEmployeeLogin(row) {
  if (!row) return null;
  return {
    rinl_id: row.rinl_id || row.emp_id,
    emp_id: row.emp_id,
    name: row.name,
    role: row.role,
    mobile: row.mobile,
    email: row.email,
    password: row.password,
    status: row.status || 'active',
    source: 'employees'
  };
}

function mapContractorLogin(row) {
  if (!row) return null;
  return {
    rinl_id: row.rinl_id || row.contractor_id,
    emp_id: row.contractor_id,
    name: row.name,
    role: 'Contractor',
    mobile: row.mobile,
    email: row.email,
    password: '1234',
    status: row.status || 'active',
    source: 'contractors'
  };
}

function mapSupervisorLogin(row) {
  if (!row) return null;
  return {
    rinl_id: row.rinl_id || row.supervisor_id,
    emp_id: row.supervisor_id,
    name: row.name,
    role: 'Supervisor',
    mobile: row.mobile,
    email: row.email,
    password: '1234',
    status: row.status || 'active',
    source: 'supervisors'
  };
}

function mapWorkerLogin(row, selectedRole) {
  if (!row) return null;
  return {
    rinl_id: row.rinl_id || row.worker_id,
    emp_id: row.worker_id,
    name: row.name,
    role: selectedRole || row.category || 'Workers',
    mobile: row.mobile,
    email: row.email,
    password: '1234',
    status: row.status || 'active',
    source: 'workers'
  };
}

async function getLoginUser(empId, role) {
  if (!empId) return null;

  if (isContractorRole(role)) {
    const contractor = await queryOne('SELECT * FROM contractors WHERE LOWER(COALESCE(rinl_id, contractor_id)) = LOWER($1) OR LOWER(contractor_id) = LOWER($1)', [empId]);
    if (contractor) return mapContractorLogin(contractor);
    return mapEmployeeLogin(await queryOne('SELECT * FROM employees WHERE LOWER(COALESCE(rinl_id, emp_id)) = LOWER($1) OR LOWER(emp_id) = LOWER($1)', [empId]));
  }

  if (isWorkerRole(role)) {
    const worker = await queryOne('SELECT * FROM workers WHERE LOWER(COALESCE(rinl_id, worker_id)) = LOWER($1) OR LOWER(worker_id) = LOWER($1)', [empId]);
    if (worker) return mapWorkerLogin(worker, role);
    return mapEmployeeLogin(await queryOne('SELECT * FROM employees WHERE LOWER(COALESCE(rinl_id, emp_id)) = LOWER($1) OR LOWER(emp_id) = LOWER($1)', [empId]));
  }

  if (isSupervisorRole(role)) {
    const supervisor = await queryOne('SELECT * FROM supervisors WHERE LOWER(COALESCE(rinl_id, supervisor_id)) = LOWER($1) OR LOWER(supervisor_id) = LOWER($1)', [empId]);
    if (supervisor) return mapSupervisorLogin(supervisor);
    return mapEmployeeLogin(await queryOne('SELECT * FROM employees WHERE LOWER(COALESCE(rinl_id, emp_id)) = LOWER($1) OR LOWER(emp_id) = LOWER($1)', [empId]));
  }

  if (isAdminRole(role) || isEngineerRole(role)) {
    return mapEmployeeLogin(await queryOne('SELECT * FROM employees WHERE LOWER(COALESCE(rinl_id, emp_id)) = LOWER($1) OR LOWER(emp_id) = LOWER($1)', [empId]));
  }

  return mapEmployeeLogin(await queryOne('SELECT * FROM employees WHERE LOWER(COALESCE(rinl_id, emp_id)) = LOWER($1) OR LOWER(emp_id) = LOWER($1)', [empId]));
}

function notFoundMessage(role) {
  if (isContractorRole(role)) return 'Contractor ID not found.';
  if (isWorkerRole(role)) return 'Worker ID not found.';
  if (isAdminRole(role)) return 'Admin ID not found.';
  if (isSupervisorRole(role)) return 'Supervisor ID not found.';
  return 'Employee ID not found.';
}

function validateLoginUser(user, { password, role, type, value }) {
  if (!user) return notFoundMessage(role);
  if (String(user.status || 'active').toLowerCase() !== 'active') return 'This user is not active. Contact admin.';
  if (password !== undefined && user.password !== password) return 'Incorrect password.';
  if (!rolesMatch(role, user.role)) return 'Selected role does not match this user role.';
  if (type === 'phone' && !user.mobile) return 'Mobile number is not available for this user. Use Email OTP.';
  if (type === 'phone' && String(user.mobile).trim() !== String(value || '').trim()) return 'Mobile number does not match this user.';
  if (type === 'email' && user.email && String(user.email).trim().toLowerCase() !== String(value || '').trim().toLowerCase()) return 'Email does not match this user.';
  if (type === 'email' && !user.email) return '';
  return '';
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function emailDeliveryErrorMessage(err) {
  const detail = err?.response || err?.message || 'Unknown Gmail SMTP error.';
  return `Could not send OTP email: ${detail}`;
}

function withTimeout(promise, ms, message) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), ms);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

function splitRecipients(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueRecipients(values) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

async function getNotificationRecipients(event) {
  const hostFlag = event === 'login' ? 'notify_on_login' : 'notify_on_signup';

  try {
    const hostResult = await db.query(
      `SELECT email, phone
       FROM hosts
       WHERE active = TRUE AND ${hostFlag} = TRUE
       ORDER BY id`
    );
    const hostEmails = uniqueRecipients(hostResult.rows.map((row) => row.email));
    const hostPhones = uniqueRecipients(hostResult.rows.map((row) => row.phone));

    if (hostEmails.length || hostPhones.length) {
      return { email: hostEmails, sms: hostPhones };
    }
  } catch (err) {
    console.error('Could not load hosts table notification recipients:', err.message);
  }

  try {
    const result = await db.query(
      `SELECT channel, destination
       FROM notification_recipients
       WHERE active = TRUE AND event = $1
       ORDER BY id`,
      [event]
    );

    return {
      email: uniqueRecipients(result.rows.filter((row) => row.channel === 'email').map((row) => row.destination)),
      sms: uniqueRecipients(result.rows.filter((row) => row.channel === 'sms').map((row) => row.destination))
    };
  } catch (err) {
    console.error('Could not load notification recipients:', err.message);
    return { email: [], sms: [] };
  }
}

function firstForwardedIp(value) {
  return String(value || '').split(',')[0].trim();
}

function getClientIp(req) {
  return (
    firstForwardedIp(req.headers['x-forwarded-for']) ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    req.ip ||
    'unknown'
  );
}

function getRequestDetails(req) {
  const userAgent = req.headers['user-agent'] || '';
  const parser = new UAParser(userAgent);
  const browser = parser.getBrowser();
  const os = parser.getOS();
  const device = parser.getDevice();

  return {
    ip: getClientIp(req),
    browser: browser.name || 'Unknown',
    browserVersion: browser.version || '',
    operatingSystem: os.name ? [os.name, os.version].filter(Boolean).join(' ') : 'Unknown',
    device: device.type || device.model || 'Desktop',
    userAgent
  };
}

async function isExistingPortalId(empId) {
  const existingEmployee = await queryOne('SELECT emp_id FROM employees WHERE LOWER(COALESCE(rinl_id, emp_id)) = LOWER($1) OR LOWER(emp_id) = LOWER($1)', [empId]);
  if (existingEmployee) return true;

  const existingContractor = await queryOne('SELECT contractor_id FROM contractors WHERE LOWER(COALESCE(rinl_id, contractor_id)) = LOWER($1) OR LOWER(contractor_id) = LOWER($1)', [empId]);
  if (existingContractor) return true;

  const existingSupervisor = await queryOne('SELECT supervisor_id FROM supervisors WHERE LOWER(COALESCE(rinl_id, supervisor_id)) = LOWER($1) OR LOWER(supervisor_id) = LOWER($1)', [empId]);
  if (existingSupervisor) return true;

  const existingWorker = await queryOne('SELECT worker_id FROM workers WHERE LOWER(COALESCE(rinl_id, worker_id)) = LOWER($1) OR LOWER(worker_id) = LOWER($1)', [empId]);
  return Boolean(existingWorker);
}

function rinlPrefixForRole(role) {
  const normalized = normalizeRole(role);
  if (isAdminRole(normalized)) return 'RINL-AM-';
  if (isEngineerRole(normalized)) return 'RINL-ENG-';
  if (isContractorRole(normalized)) return 'RINL-CON-';
  if (isSupervisorRole(normalized)) return 'RINL-SUP-';
  if (isWorkerRole(normalized)) return 'RINL-WK-';
  return 'RINL-USR-';
}

async function generateRinlId(role) {
  const prefix = rinlPrefixForRole(role);

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const randomPart = Math.floor(1000 + Math.random() * 9000);
    const candidate = `${prefix}${randomPart}`;
    if (!(await isExistingPortalId(candidate))) return candidate;
  }

  throw new Error('Could not generate a unique RINL ID. Please try again.');
}

function signupNotificationText(user, req) {
  const details = getRequestDetails(req);
  return [
    'New RINL Wage Portal signup',
    `Name: ${user.name}`,
    `ID: ${user.emp_id}`,
    `Role: ${user.role}`,
    `Mobile: ${user.mobile || 'Not provided'}`,
    `Email: ${user.email || 'Not provided'}`,
    `Time: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`,
    `IP: ${details.ip}`,
    `Browser: ${details.browser}${details.browserVersion ? ` ${details.browserVersion}` : ''}`,
    `OS: ${details.operatingSystem}`,
    `Device: ${details.device}`
  ].join('\n');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function signupNotificationHtml(user, req) {
  const details = getRequestDetails(req);
  const rows = [
    ['Name', user.name],
    ['ID', user.emp_id],
    ['Role', user.role],
    ['Mobile', user.mobile || 'Not provided'],
    ['Email', user.email || 'Not provided'],
    ['Time', new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })],
    ['IP', details.ip],
    ['Browser', `${details.browser}${details.browserVersion ? ` ${details.browserVersion}` : ''}`],
    ['OS', details.operatingSystem],
    ['Device', details.device]
  ];

  const bodyRows = rows.map(([label, value]) => (
    `<tr><td style="padding:8px 12px;border:1px solid #dde3ed;font-weight:600;">${escapeHtml(label)}</td><td style="padding:8px 12px;border:1px solid #dde3ed;">${escapeHtml(value)}</td></tr>`
  )).join('');

  return `
    <div style="font-family:Arial,sans-serif;color:#1a1a2e;">
      <h2 style="color:#003f8a;">New RINL Wage Portal Signup</h2>
      <p>A new user created an account. Password details are not included for security.</p>
      <table style="border-collapse:collapse;width:100%;max-width:620px;">${bodyRows}</table>
    </div>
  `;
}

async function notifySignup(user, req) {
  const text = signupNotificationText(user, req);
  const recipients = await getNotificationRecipients('signup');
  const emailRecipients = recipients.email.length ? recipients.email : splitRecipients(mailConfig.signupNotifyEmail);
  const smsRecipients = recipients.sms.length ? recipients.sms : splitRecipients(twilioConfig.signupNotifyPhone);
  const notifications = {
    email: { attempted: false, sent: false, message: '' },
    sms: { attempted: false, sent: false, message: '' }
  };
  const tasks = [];

  if (mailConfig.gmailUser && mailConfig.gmailPass && emailRecipients.length) {
    notifications.email.attempted = true;
    tasks.push({
      type: 'email',
      task: transporter.sendMail({
        from: `"RINL Wage Portal" <${mailConfig.gmailUser}>`,
        to: emailRecipients,
        subject: `New signup: ${user.name} (${user.role})`,
        text,
        html: signupNotificationHtml(user, req)
      })
    });
  } else {
    notifications.email.message = 'Email notification not configured. Add active email rows to notification_recipients, or set EMAIL, EMAIL_PASSWORD, and SIGNUP_NOTIFY_EMAIL.';
  }

  if (twilioClient && smsRecipients.length && (twilioConfig.phoneNumber || twilioConfig.messagingServiceSid)) {
    notifications.sms.attempted = true;
    smsRecipients.forEach((phone) => {
      const messageOptions = {
        to: phone,
        body: text
      };

      if (twilioConfig.messagingServiceSid) {
        messageOptions.messagingServiceSid = twilioConfig.messagingServiceSid;
      } else {
        messageOptions.from = twilioConfig.phoneNumber;
      }

      tasks.push({ type: 'sms', recipient: phone, task: twilioClient.messages.create(messageOptions) });
    });
  } else {
    const missing = [];
    if (!twilioClient) missing.push('TWILIO_SID/TWILIO_AUTH_TOKEN');
    if (!smsRecipients.length) missing.push('notification_recipients SMS row or SIGNUP_NOTIFY_PHONE');
    if (!twilioConfig.phoneNumber && !twilioConfig.messagingServiceSid) missing.push('TWILIO_PHONE_NUMBER or TWILIO_MESSAGING_SERVICE_SID');
    notifications.sms.message = `SMS notification not configured. Missing: ${missing.join(', ') || 'unknown settings'}.`;
  }

  if (!tasks.length) {
    console.log('Signup notification not sent:', notifications);
    return notifications;
  }

  const results = await Promise.allSettled(tasks.map((entry) => entry.task));
  results.forEach((result, index) => {
    const type = tasks[index].type;
    if (result.status === 'rejected') {
      notifications[type].message = result.reason?.message || String(result.reason);
      console.error(`${type.toUpperCase()} signup notification failed${tasks[index].recipient ? ` for ${tasks[index].recipient}` : ''}:`, notifications[type].message);
    } else {
      notifications[type].sent = true;
      notifications[type].message = `${type.toUpperCase()} notification sent.`;
      if (tasks[index].recipient) console.log(`${type.toUpperCase()} signup notification sent to ${tasks[index].recipient}.`);
    }
  });

  return notifications;
}

function activityNotificationText(action, user, req, reason = '') {
  const details = getRequestDetails(req);
  const title = action === 'LOGIN_FAILED' ? 'Failed RINL Wage Portal login attempt' : 'RINL Wage Portal login';
  return [
    title,
    `Name: ${user.name || 'Unknown'}`,
    `ID: ${user.emp_id || user.rinl_id || 'Unknown'}`,
    `Role: ${user.role || 'Unknown'}`,
    `Mobile: ${user.mobile || 'Not provided'}`,
    `Email: ${user.email || 'Not provided'}`,
    reason ? `Reason: ${reason}` : '',
    `Time: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`,
    `IP: ${details.ip}`,
    `Browser: ${details.browser}${details.browserVersion ? ` ${details.browserVersion}` : ''}`,
    `OS: ${details.operatingSystem}`,
    `Device: ${details.device}`
  ].filter(Boolean).join('\n');
}

function activityNotificationHtml(action, user, req, reason = '') {
  const details = getRequestDetails(req);
  const rows = [
    ['Name', user.name || 'Unknown'],
    ['ID', user.emp_id || user.rinl_id || 'Unknown'],
    ['Role', user.role || 'Unknown'],
    ['Mobile', user.mobile || 'Not provided'],
    ['Email', user.email || 'Not provided'],
    ['Reason', reason || 'Successful login'],
    ['Time', new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })],
    ['IP', details.ip],
    ['Browser', `${details.browser}${details.browserVersion ? ` ${details.browserVersion}` : ''}`],
    ['OS', details.operatingSystem],
    ['Device', details.device]
  ];

  const bodyRows = rows.map(([label, value]) => (
    `<tr><td style="padding:8px 12px;border:1px solid #dde3ed;font-weight:600;">${escapeHtml(label)}</td><td style="padding:8px 12px;border:1px solid #dde3ed;">${escapeHtml(value)}</td></tr>`
  )).join('');

  return `
    <div style="font-family:Arial,sans-serif;color:#1a1a2e;">
      <h2 style="color:#003f8a;">${escapeHtml(action === 'LOGIN_FAILED' ? 'Failed RINL Wage Portal Login' : 'New RINL Wage Portal Login')}</h2>
      <p>${escapeHtml(action === 'LOGIN_FAILED' ? 'A login attempt failed. Password details are not included for security.' : 'A user logged in successfully. Password details are not included for security.')}</p>
      <table style="border-collapse:collapse;width:100%;max-width:620px;">${bodyRows}</table>
    </div>
  `;
}

async function notifyLoginActivity(action, user, req, reason = '') {
  const text = activityNotificationText(action, user, req, reason);
  const recipients = await getNotificationRecipients('login');
  const emailRecipients = recipients.email.length ? recipients.email : splitRecipients(mailConfig.loginNotifyEmail);
  const smsRecipients = recipients.sms.length ? recipients.sms : splitRecipients(twilioConfig.loginNotifyPhone);
  const tasks = [];

  if (mailConfig.gmailUser && mailConfig.gmailPass && emailRecipients.length) {
    tasks.push({
      type: 'email',
      task: transporter.sendMail({
        from: `"RINL Wage Portal" <${mailConfig.gmailUser}>`,
        to: emailRecipients,
        subject: action === 'LOGIN_FAILED'
          ? `Failed login attempt: ${user.emp_id || 'unknown'}`
          : `New login: ${user.name || user.emp_id || 'unknown'} (${user.role || 'Unknown'})`,
        text,
        html: activityNotificationHtml(action, user, req, reason)
      })
    });
  }

  if (twilioClient && smsRecipients.length && (twilioConfig.phoneNumber || twilioConfig.messagingServiceSid)) {
    smsRecipients.forEach((phone) => {
      const messageOptions = {
        to: phone,
        body: text
      };

      if (twilioConfig.messagingServiceSid) {
        messageOptions.messagingServiceSid = twilioConfig.messagingServiceSid;
      } else {
        messageOptions.from = twilioConfig.phoneNumber;
      }

      tasks.push({ type: 'sms', recipient: phone, task: twilioClient.messages.create(messageOptions) });
    });
  }

  if (!tasks.length) return;

  const results = await Promise.allSettled(tasks.map((entry) => entry.task));
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error(`${tasks[index].type.toUpperCase()} login notification failed${tasks[index].recipient ? ` for ${tasks[index].recipient}` : ''}:`, result.reason?.message || String(result.reason));
    } else if (tasks[index].recipient) {
      console.log(`${tasks[index].type.toUpperCase()} login notification sent to ${tasks[index].recipient}.`);
    }
  });
}

async function insertLoginLog({ empId, name, role, action, req }) {
  const details = getRequestDetails(req);
  await db.query(
    `INSERT INTO login_logs
       (emp_id, name, role, action, ip_address, browser, browser_version, operating_system, device, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      empId || 'unknown',
      name || null,
      role || 'unknown',
      action,
      details.ip,
      details.browser,
      details.browserVersion,
      details.operatingSystem,
      details.device,
      details.userAgent
    ]
  );
}

async function recordLoginActivity(payload) {
  try {
    await insertLoginLog(payload);
  } catch (err) {
    console.error('Login activity log failed:', err.message);
  }
}

function sendLoginActivityNotification(action, user, req, reason = '') {
  notifyLoginActivity(action, user, req, reason).catch((err) => {
    console.error('Login activity notification failed:', err.message);
  });
}

function queueSignupNotification(user, req) {
  const hasEmailFallback = Boolean(mailConfig.gmailUser && mailConfig.gmailPass && mailConfig.signupNotifyEmail);
  const hasSmsFallback = Boolean(twilioClient && twilioConfig.signupNotifyPhone && (twilioConfig.phoneNumber || twilioConfig.messagingServiceSid));
  const notifications = {
    email: {
      attempted: hasEmailFallback,
      sent: false,
      message: hasEmailFallback
        ? 'Email notification queued.'
        : 'Email notification queued if active email recipients exist in notification_recipients.'
    },
    sms: {
      attempted: hasSmsFallback,
      sent: false,
      message: hasSmsFallback
        ? 'SMS notification queued.'
        : 'SMS notification queued if active SMS recipients exist in notification_recipients.'
    }
  };

  notifySignup(user, req).catch((err) => {
    console.error('Signup notification failed:', err.message);
  });

  return notifications;
}

async function signup(req, res, next) {
  try {
    const { name, role, mobile, email, password, confirmPassword } = req.body;
    const cleanName = String(name || '').trim();
    const cleanRole = String(role || '').trim();
    const cleanMobile = String(mobile || '').trim();
    const cleanEmail = String(email || '').trim().toLowerCase();

    if (!cleanName || !cleanRole || !cleanMobile || !password || !confirmPassword) {
      return res.status(400).json({ success: false, message: 'Please fill in all required signup fields.' });
    }

    if (!/^\d{10}$/.test(cleanMobile)) {
      return res.status(400).json({ success: false, message: 'Enter a valid 10-digit mobile number.' });
    }

    if (cleanEmail && !isValidEmail(cleanEmail)) {
      return res.status(400).json({ success: false, message: 'Enter a valid email address.' });
    }

    if (String(password).length < 4) {
      return res.status(400).json({ success: false, message: 'Password must be at least 4 characters.' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Passwords do not match.' });
    }

    const generatedEmpId = await generateRinlId(cleanRole);

    const created = await queryOne(
      `INSERT INTO employees (rinl_id, emp_id, name, role, mobile, email, password, status)
       VALUES ($1, $1, $2, $3, $4, $5, $6, 'active')
       RETURNING rinl_id, emp_id, name, role, mobile, email, status, created_at`,
      [generatedEmpId, cleanName, cleanRole, cleanMobile, cleanEmail || null, password]
    );

    const notifications = queueSignupNotification(created, req);
    await recordLoginActivity({
      empId: created.emp_id,
      name: created.name,
      role: created.role,
      action: 'SIGNUP',
      req
    });

    return res.status(201).json({
      success: true,
      message: `Account created successfully. Your RINL ID is ${created.emp_id}. Use this ID to log in.`,
      employee: created,
      notifications
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, message: 'An account with this ID already exists.' });
    }
    next(err);
  }
}

async function sendOtp(req, res, next) {
  try {
    const { type, value, empId, password, role } = req.body;
    if (!type || !value) {
      return res.status(400).json({ success: false, message: 'Type and value required.' });
    }
    if (!['phone', 'email'].includes(type)) {
      return res.status(400).json({ success: false, message: 'OTP type must be phone or email.' });
    }

    if (empId || password) {
      const loginUser = await getLoginUser(empId, role);
      const validationError = validateLoginUser(loginUser, { password, role, type, value });
      if (validationError) {
        const attemptedUser = loginUser || { emp_id: empId, name: empId, role };
        await recordLoginActivity({
          empId: attemptedUser.rinl_id || attemptedUser.emp_id || empId,
          name: attemptedUser.name || empId,
          role: attemptedUser.role || role,
          action: 'LOGIN_FAILED',
          req
        });
        sendLoginActivityNotification('LOGIN_FAILED', attemptedUser, req, validationError);
        return res.status(validationError.includes('not active') ? 403 : 400).json({ success: false, message: validationError });
      }
    }

    if (type === 'phone') {
      if (!/^\d{10}$/.test(value)) return res.status(400).json({ success: false, message: 'Enter valid 10-digit mobile.' });

      if (!twilioClient || !twilioConfig.verifyServiceSid) {
        const fallback = localOtpFallbackResponse(type, value, 'Mobile OTP is not configured.');
        if (fallback) return res.json(fallback);
        return res.status(500).json({
          success: false,
          message: 'Mobile OTP is not configured. Set TWILIO_SID, TWILIO_AUTH_TOKEN, and TWILIO_VERIFY_SID in .env, then restart the backend.'
        });
      }

      try {
        await withTimeout(
          twilioClient.verify.v2.services(twilioConfig.verifyServiceSid).verifications.create({ to: `+91${value}`, channel: 'sms' }),
          OTP_PROVIDER_TIMEOUT_MS,
          'Twilio SMS request timed out. Check Twilio credentials, Verify SID, account balance, and phone number permissions.'
        );
        return res.json({ success: true, message: 'OTP sent to mobile.' });
      } catch (smsErr) {
        const smsMessage = smsErr.message || smsErr.moreInfo || smsErr.code || 'Unknown Twilio error.';
        console.error('SMS OTP failed:', smsMessage);
        const fallback = localOtpFallbackResponse(type, value, smsMessage);
        if (fallback) return res.json(fallback);
        return res.status(500).json({
          success: false,
          message: `Could not send mobile OTP: ${smsMessage}`
        });
      }
    }

    const emailValue = String(value || '').trim().toLowerCase();
    if (!isValidEmail(emailValue)) return res.status(400).json({ success: false, message: 'Enter valid email.' });

    const otp = generateOtp();
    storeLocalOtp(type, emailValue, otp);

    if (!mailConfig.gmailUser || !mailConfig.gmailPass) {
      const fallback = localOtpFallbackResponse(type, emailValue, 'Email OTP is not configured.', otp);
      if (fallback) return res.json(fallback);
      delete otpStore[otpStoreKey(type, emailValue)];
      return res.status(500).json({
        success: false,
        message: 'Email OTP is not configured. Set EMAIL and EMAIL_PASSWORD in .env, then restart the backend.'
      });
    }

try {
  await withTimeout(
    transporter.sendMail({
      from: `"RINL Wage Portal" <${mailConfig.gmailUser}>`,
      to: emailValue,
      subject: 'RINL Wage Portal OTP Verification',
      text: `Your RINL Wage Portal OTP is ${otp}. It is valid for 2 minutes.`,
      html: `<p>Your RINL Wage Portal OTP is <strong>${otp}</strong>. It is valid for 2 minutes.</p>`
    }),
    OTP_PROVIDER_TIMEOUT_MS,
    'Gmail SMTP request timed out. Check internet/DNS access and Gmail app password settings.'
  );
  return res.json(otpSuccessResponse('OTP sent to email.', otp));
} catch (mailErr) {
  console.error('Email send failed:', mailErr.message);
  const fallback = localOtpFallbackResponse(type, emailValue, mailErr.message, otp);
  if (fallback) return res.json(fallback);
  delete otpStore[otpStoreKey(type, emailValue)];
  return res.status(500).json({
    success: false,
    message: emailDeliveryErrorMessage(mailErr)
  });
}
  } catch (err) {
    next(err);
  }
}

async function verifyOtp(req, res, next) {
  try {
    const { type, value, otp, empId, role } = req.body;
    if (!type || !value || !otp) return res.status(400).json({ success: false, message: 'All fields required.' });
    const otpValue = type === 'email' ? String(value || '').trim().toLowerCase() : value;

    let verified = false;
    if (type === 'phone') {
      const record = otpStore[otpStoreKey(type, otpValue)];
      if (record) {
        if (Date.now() > record.expiresAt) {
          delete otpStore[otpStoreKey(type, otpValue)];
          return res.status(400).json({ success: false, message: 'OTP expired.' });
        }
        verified = record.otp === otp;
        if (verified) delete otpStore[otpStoreKey(type, otpValue)];
      } else {
        if (!twilioClient || !twilioConfig.verifyServiceSid) return res.status(400).json({ success: false, message: 'SMS not configured. Request a new OTP.' });
        const result = await twilioClient.verify.v2.services(twilioConfig.verifyServiceSid).verificationChecks.create({ to: `+91${otpValue}`, code: otp });
        verified = result.status === 'approved';
      }
    } else {
      const record = otpStore[otpStoreKey(type, otpValue)];
      if (!record) return res.status(400).json({ success: false, message: 'OTP not found. Request a new one.' });
      if (Date.now() > record.expiresAt) {
        delete otpStore[otpStoreKey(type, otpValue)];
        return res.status(400).json({ success: false, message: 'OTP expired.' });
      }
      verified = record.otp === otp;
      if (verified) delete otpStore[otpStoreKey(type, otpValue)];
    }

    if (!verified) return res.status(400).json({ success: false, message: 'Invalid OTP. Try again.' });

    const loginUser = empId ? await getLoginUser(empId, role) : null;
    const validationError = loginUser ? validateLoginUser(loginUser, { role, type, value: otpValue }) : '';
    if (validationError) return res.status(validationError.includes('not active') ? 403 : 400).json({ success: false, message: validationError });
    const loginRole = loginUser ? loginUser.role : (role || 'User');
    const loginName = loginUser ? loginUser.name : empId || value;
    const loginEmpId = loginUser ? (loginUser.rinl_id || loginUser.emp_id) : (empId || value);
    const details = getRequestDetails(req);

    const session = await queryOne(
      `INSERT INTO login_sessions (emp_id, name, role, ip_address, browser, browser_version, operating_system, device, user_agent, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active')
       RETURNING id`,
      [
        loginEmpId,
        loginName,
        loginRole,
        details.ip,
        details.browser,
        details.browserVersion,
        details.operatingSystem,
        details.device,
        details.userAgent
      ]
    );

    await recordLoginActivity({ empId: loginEmpId, name: loginName, role: loginRole, action: 'LOGIN', req });
    sendLoginActivityNotification('LOGIN', {
      emp_id: loginEmpId,
      rinl_id: loginEmpId,
      name: loginName,
      role: loginRole,
      mobile: loginUser?.mobile || null,
      email: loginUser?.email || null
    }, req);

    return res.json({
      success: true,
      message: 'Login successful.',
      sessionId: session.id,
      employee: {
        rinlId: loginEmpId,
        rinl_id: loginEmpId,
        empId: loginEmpId,
        name: loginName,
        role: normalizeRole(loginRole) === 'admin' ? 'admin' : loginRole
      }
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
    await recordLoginActivity({ empId: empId || 'unknown', role: role || 'unknown', action: 'LOGOUT', req });
    return res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { signup, sendOtp, verifyOtp, logout };
