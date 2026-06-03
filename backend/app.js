/* ═══════════════════════════════════════════════════════
   RINL Contractor Wage Management System
   app.js — Frontend Logic (OTP login flow)
   ═══════════════════════════════════════════════════════ */

const SERVER_URL = 'http://localhost:3000';

let otpMethod    = 'phone';
let otpTarget    = '';
let timerInterval  = null;
let resendInterval = null;

/* ── OTP Method Toggle ─────────────────────────────── */
function switchMethod(method) {
  otpMethod = method;
  if (method === 'phone') {
    document.getElementById('phoneField').style.display = 'block';
    document.getElementById('emailField').style.display = 'none';
    document.getElementById('tabPhone').classList.add('active');
    document.getElementById('tabEmail').classList.remove('active');
  } else {
    document.getElementById('phoneField').style.display = 'none';
    document.getElementById('emailField').style.display = 'block';
    document.getElementById('tabPhone').classList.remove('active');
    document.getElementById('tabEmail').classList.add('active');
  }
}

/* ── Modal Open / Close ────────────────────────────── */
function openLogin() {
  document.getElementById('overlay').classList.add('active');
  showStep('login');
}

function closeLogin() {
  document.getElementById('overlay').classList.remove('active');
  clearInterval(timerInterval);
  clearInterval(resendInterval);
}

function handleOvClick(e) {
  if (e.target === document.getElementById('overlay')) closeLogin();
}

/* ── Step Switcher ─────────────────────────────────── */
function showStep(step) {
  document.getElementById('stepLogin').style.display = step === 'login' ? 'block' : 'none';
  document.getElementById('stepOtp').style.display   = step === 'otp'   ? 'block' : 'none';
  document.getElementById('errBox').classList.remove('show');
  document.getElementById('errOtp').classList.remove('show');
  document.getElementById('successOtp').style.display = 'none';

  if (step === 'login') {
    document.getElementById('modalTitle').textContent = 'RINL Wage Portal';
    document.getElementById('modalSub').textContent   = 'Contractor Wage Management System';
  } else {
    document.getElementById('modalTitle').textContent = 'OTP Verification';
    document.getElementById('modalSub').textContent   = 'Step 2 of 2 — Verify your identity';
  }
}

/* ── Password Toggle ───────────────────────────────── */
function togglePwd() {
  const p = document.getElementById('empPwd');
  const b = document.getElementById('eyeBtn');
  p.type   = p.type === 'password' ? 'text' : 'password';
  b.textContent = p.type === 'password' ? '👁' : '🙈';
}

/* ── Send OTP (Step 1) ─────────────────────────────── */
async function doLogin() {
  const id    = document.getElementById('empId').value.trim();
  const role  = document.getElementById('empRole').value;
  const pwd   = document.getElementById('empPwd').value;
  const errBox = document.getElementById('errBox');
  const value = otpMethod === 'phone'
    ? document.getElementById('empMobile').value.trim()
    : document.getElementById('empEmail').value.trim();

  // Validation
  if (!id || !role || !pwd || !value) {
    errBox.textContent = 'Please fill in all fields to continue.';
    errBox.classList.add('show');
    return;
  }
  if (otpMethod === 'phone' && !/^\d{10}$/.test(value)) {
    errBox.textContent = 'Please enter a valid 10-digit mobile number.';
    errBox.classList.add('show');
    return;
  }
  if (otpMethod === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    errBox.textContent = 'Please enter a valid email address.';
    errBox.classList.add('show');
    return;
  }

  errBox.classList.remove('show');
  otpTarget = value;

  const btn = document.querySelector('#stepLogin .signin-btn');
  btn.textContent = 'Sending OTP...';
  btn.disabled = true;

  try {
    const res  = await fetch(`${SERVER_URL}/send-otp`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ type: otpMethod, value })
    });
    const data = await res.json();

    if (data.success) {
      // Mask the target for display
      let masked = '';
      if (otpMethod === 'phone') {
        masked = `+91 ${value.substring(0,2)}XXXXXX${value.substring(8)}`;
      } else {
        const parts = value.split('@');
        masked = `${parts[0].substring(0,3)}****@${parts[1]}`;
      }
      document.getElementById('maskedValue').textContent = masked;
      clearOtpBoxes();
      showStep('otp');
      startOtpTimer();
      startResendTimer();
      setTimeout(() => document.getElementById('otp0').focus(), 100);
    } else {
      errBox.textContent = data.message || 'Failed to send OTP. Try again.';
      errBox.classList.add('show');
    }
  } catch (err) {
    errBox.textContent = 'Cannot connect to server. Make sure server.js is running.';
    errBox.classList.add('show');
  }

  btn.textContent = 'Send OTP & Continue →';
  btn.disabled = false;
}

/* ── OTP Countdown Timer ───────────────────────────── */
function startOtpTimer() {
  clearInterval(timerInterval);
  let seconds = 120;
  updateTimerDisplay(seconds);
  timerInterval = setInterval(() => {
    seconds--;
    updateTimerDisplay(seconds);
    if (seconds <= 0) {
      clearInterval(timerInterval);
      const el = document.getElementById('otpTimerDisplay');
      el.textContent = 'Expired';
      el.style.color  = 'var(--red)';
    }
  }, 1000);
}

function updateTimerDisplay(seconds) {
  const m  = Math.floor(seconds / 60);
  const s  = seconds % 60;
  const el = document.getElementById('otpTimerDisplay');
  el.style.color = seconds <= 30 ? 'var(--red)' : 'var(--blue)';
  el.textContent = `${m}:${s < 10 ? '0' : ''}${s}`;
}

/* ── Resend Cooldown Timer ─────────────────────────── */
function startResendTimer() {
  clearInterval(resendInterval);
  document.getElementById('resendBtn').disabled = true;
  let secs = 30;
  document.getElementById('resendTimer').textContent = ` (${secs}s)`;
  resendInterval = setInterval(() => {
    secs--;
    if (secs <= 0) {
      clearInterval(resendInterval);
      document.getElementById('resendBtn').disabled = false;
      document.getElementById('resendTimer').textContent = '';
    } else {
      document.getElementById('resendTimer').textContent = ` (${secs}s)`;
    }
  }, 1000);
}

/* ── OTP Box Keyboard Handling ─────────────────────── */
function otpNext(input, index) {
  input.value = input.value.replace(/\D/g, '');
  if (input.value) {
    input.classList.add('filled');
    input.classList.remove('error');
    if (index < 5) {
      document.getElementById(`otp${index + 1}`).focus();
    } else {
      document.getElementById('verifyBtn').click();
    }
  } else {
    input.classList.remove('filled');
  }
}

function otpBack(event, index) {
  if (event.key === 'Backspace' && !event.target.value && index > 0) {
    document.getElementById(`otp${index - 1}`).focus();
  }
}

function getEnteredOtp() {
  return Array.from({ length: 6 }, (_, i) => document.getElementById(`otp${i}`).value).join('');
}

function clearOtpBoxes() {
  for (let i = 0; i < 6; i++) {
    const b = document.getElementById(`otp${i}`);
    b.value = '';
    b.classList.remove('filled', 'error', 'success');
  }
}

/* ── Verify OTP (Step 2) ───────────────────────────── */
async function verifyOtp() {
  const entered  = getEnteredOtp();
  const errOtp   = document.getElementById('errOtp');

  if (entered.length < 6) {
    errOtp.textContent = 'Please enter all 6 digits of the OTP.';
    errOtp.classList.add('show');
    return;
  }

  const btn = document.getElementById('verifyBtn');
  btn.textContent = 'Verifying...';
  btn.disabled = true;

  try {
    const res  = await fetch(`${SERVER_URL}/verify-otp`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ type: otpMethod, value: otpTarget, otp: entered })
    });
    const data = await res.json();

    if (data.success) {
      errOtp.classList.remove('show');
      for (let i = 0; i < 6; i++) document.getElementById(`otp${i}`).classList.add('success');
      document.getElementById('successOtp').style.display = 'block';
      clearInterval(timerInterval);
      clearInterval(resendInterval);
      setTimeout(() => { closeLogin(); showDashboard(); }, 1500);
    } else {
      errOtp.textContent = data.message || 'Invalid OTP. Please try again.';
      errOtp.classList.add('show');
      for (let i = 0; i < 6; i++) {
        document.getElementById(`otp${i}`).classList.add('error');
        document.getElementById(`otp${i}`).classList.remove('filled');
      }
      setTimeout(() => { clearOtpBoxes(); document.getElementById('otp0').focus(); }, 700);
      btn.textContent = 'Verify OTP & Login';
      btn.disabled = false;
    }
  } catch (err) {
    errOtp.textContent = 'Cannot connect to server. Make sure server.js is running.';
    errOtp.classList.add('show');
    btn.textContent = 'Verify OTP & Login';
    btn.disabled = false;
  }
}

/* ── Resend OTP ────────────────────────────────────── */
async function resendOtp() {
  const btn = document.getElementById('resendBtn');
  btn.textContent = 'Sending...';
  btn.disabled = true;

  try {
    const res  = await fetch(`${SERVER_URL}/send-otp`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ type: otpMethod, value: otpTarget })
    });
    const data = await res.json();

    if (data.success) {
      document.getElementById('errOtp').classList.remove('show');
      document.getElementById('otpTimerDisplay').style.color = 'var(--blue)';
      clearOtpBoxes();
      startOtpTimer();
      startResendTimer();
      document.getElementById('otp0').focus();
    } else {
      document.getElementById('errOtp').textContent = data.message || 'Failed to resend OTP.';
      document.getElementById('errOtp').classList.add('show');
      btn.disabled = false;
    }
  } catch (err) {
    document.getElementById('errOtp').textContent = 'Server error. Make sure server.js is running.';
    document.getElementById('errOtp').classList.add('show');
    btn.disabled = false;
  }

  btn.textContent = 'Resend OTP';
}

/* ── Go Back to Login ──────────────────────────────── */
function goBack() {
  clearInterval(timerInterval);
  clearInterval(resendInterval);
  showStep('login');
}

/* ── Dashboard (post-login) ────────────────────────── */
function showDashboard() {
  const role = document.getElementById('empRole').value;
  const id   = document.getElementById('empId').value.trim();

  document.body.innerHTML = `
    <div style="font-family:'Noto Sans',sans-serif;background:#f4f7fc;min-height:100vh;">
      <nav style="background:#003f8a;padding:0 2rem;height:60px;display:flex;align-items:center;justify-content:space-between;">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="background:#e07b2a;width:34px;height:34px;border-radius:6px;display:flex;align-items:center;justify-content:center;">
            <span style="color:white;font-size:16px;">🏭</span>
          </div>
          <div>
            <div style="font-family:'Rajdhani',sans-serif;font-size:16px;font-weight:700;color:#fff;">RINL · <span style="color:#f5a800;">VIZAG STEEL</span></div>
            <div style="font-size:10px;color:#aac4f0;">Contractor Wage Management System</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:12px;">
          <span style="font-size:12px;color:#aac4f0;">👤 ${id} | ${role}</span>
          <button onclick="location.reload()" style="background:#c0001e;color:#fff;border:none;padding:7px 16px;border-radius:5px;cursor:pointer;font-size:13px;">Logout</button>
        </div>
      </nav>
      <div style="padding:2rem;">
        <div style="margin-bottom:1.5rem;">
          <h2 style="font-family:'Rajdhani',sans-serif;font-size:26px;color:#003f8a;margin-bottom:4px;">Welcome, ${role}!</h2>
          <p style="color:#6e7f8d;font-size:14px;">RINL Contractor Wage Management Dashboard</p>
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:2rem;">
          <div style="background:#fff;border-radius:8px;padding:1.5rem;border-left:4px solid #003f8a;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
            <div style="font-size:28px;font-weight:700;color:#003f8a;font-family:'Rajdhani',sans-serif;">124</div>
            <div style="font-size:12px;color:#6e7f8d;margin-top:4px;">Total Workers</div>
          </div>
          <div style="background:#fff;border-radius:8px;padding:1.5rem;border-left:4px solid #c0001e;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
            <div style="font-size:28px;font-weight:700;color:#c0001e;font-family:'Rajdhani',sans-serif;">8</div>
            <div style="font-size:12px;color:#6e7f8d;margin-top:4px;">Contractors</div>
          </div>
          <div style="background:#fff;border-radius:8px;padding:1.5rem;border-left:4px solid #f5a800;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
            <div style="font-size:28px;font-weight:700;color:#f5a800;font-family:'Rajdhani',sans-serif;">₹18.4L</div>
            <div style="font-size:12px;color:#6e7f8d;margin-top:4px;">This Month Wages</div>
          </div>
          <div style="background:#fff;border-radius:8px;padding:1.5rem;border-left:4px solid #1a7a3a;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
            <div style="font-size:28px;font-weight:700;color:#1a7a3a;font-family:'Rajdhani',sans-serif;">96%</div>
            <div style="font-size:12px;color:#6e7f8d;margin-top:4px;">Attendance Rate</div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;">
          ${[
            ['👷', 'Worker Management',  'Add, edit and manage contractor workers'],
            ['📅', 'Attendance',          'Mark and view daily attendance records'],
            ['💰', 'Wage Sheet',           'Generate monthly wage sheets'],
            ['📄', 'Reports',              'View payroll and contractor reports'],
            ['🏗️', 'Contractor List',     'Manage registered contractors'],
            ['⚙️', 'Settings',             'System configuration and preferences']
          ].map(([icon, title, desc]) => `
            <div style="background:#fff;border-radius:8px;padding:1.5rem;box-shadow:0 2px 8px rgba(0,0,0,0.06);cursor:pointer;transition:transform 0.2s;"
                 onmouseover="this.style.transform='translateY(-2px)'"
                 onmouseout="this.style.transform='none'">
              <div style="font-size:28px;margin-bottom:0.8rem;">${icon}</div>
              <div style="font-family:'Rajdhani',sans-serif;font-size:17px;font-weight:700;color:#003f8a;margin-bottom:4px;">${title}</div>
              <div style="font-size:12px;color:#6e7f8d;">${desc}</div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>`;
}

/* ── Smooth Scroll for anchor links ────────────────── */
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const t = document.querySelector(a.getAttribute('href'));
    if (t) { e.preventDefault(); t.scrollIntoView({ behavior: 'smooth' }); }
  });
});