const SERVER_URL = 'http://localhost:3000';

let otpMethod = 'phone';
let otpTarget = '';
let loginContext = {};
let authMode = 'login';
let timerInterval = null;
let resendInterval = null;

function switchMethod(method) {
  otpMethod = method;
  const phoneField = document.getElementById('phoneField');
  const emailField = document.getElementById('emailField');
  phoneField.classList.toggle('hidden', method !== 'phone');
  emailField.classList.toggle('hidden', method !== 'email');
  phoneField.style.display = method === 'phone' ? 'block' : 'none';
  emailField.style.display = method === 'email' ? 'block' : 'none';
  document.getElementById('tabPhone').classList.toggle('active', method === 'phone');
  document.getElementById('tabEmail').classList.toggle('active', method === 'email');
}

function openLogin() {
  document.getElementById('overlay').classList.add('active');
  showAuthMode('login');
  const selectedRole = localStorage.getItem('rinlSelectedRole');
  const roleSelect = document.getElementById('empRole');
  if (selectedRole && roleSelect) {
    const matchingOption = Array.from(roleSelect.options).find((option) => option.value === selectedRole);
    if (matchingOption) roleSelect.value = selectedRole;
  }
}

function openSignup() {
  document.getElementById('overlay').classList.add('active');
  showAuthMode('signup');
  const selectedRole = localStorage.getItem('rinlSelectedRole');
  const roleSelect = document.getElementById('signupRole');
  if (selectedRole && roleSelect) {
    const matchingOption = Array.from(roleSelect.options).find((option) => option.value === selectedRole);
    if (matchingOption) roleSelect.value = selectedRole;
  }
}

function closeLogin() {
  document.getElementById('overlay').classList.remove('active');
  clearInterval(timerInterval);
  clearInterval(resendInterval);
}

function handleOvClick(event) {
  if (event.target === document.getElementById('overlay')) closeLogin();
}

function showAuthMode(mode) {
  authMode = mode;
  clearInterval(timerInterval);
  clearInterval(resendInterval);
  showStep(mode);
}

function showStep(step) {
  const loginStep = document.getElementById('stepLogin');
  const signupStep = document.getElementById('stepSignup');
  const otpStep = document.getElementById('stepOtp');
  const authTabs = document.getElementById('authTabs');

  loginStep.classList.toggle('hidden', step !== 'login');
  signupStep.classList.toggle('hidden', step !== 'signup');
  otpStep.classList.toggle('hidden', step !== 'otp');
  loginStep.style.display = step === 'login' ? 'block' : 'none';
  signupStep.style.display = step === 'signup' ? 'block' : 'none';
  otpStep.style.display = step === 'otp' ? 'block' : 'none';
  document.getElementById('errBox').classList.remove('show');
  document.getElementById('signupErr').classList.remove('show');
  document.getElementById('signupSuccess').classList.add('hidden');
  document.getElementById('errOtp').classList.remove('show');
  document.getElementById('successOtp').classList.add('hidden');
  document.getElementById('loginTab').classList.toggle('active', step === 'login');
  document.getElementById('signupTab').classList.toggle('active', step === 'signup');
  authTabs.style.display = step === 'otp' ? 'none' : 'grid';

  if (step === 'login') {
    document.getElementById('modalTitle').textContent = 'RINL Wage Portal';
    document.getElementById('modalSub').textContent = 'Contractor Wage Management System';
  } else if (step === 'signup') {
    document.getElementById('modalTitle').textContent = 'Create Account';
    document.getElementById('modalSub').textContent = 'Store your account in the wage portal database';
  } else {
    document.getElementById('modalTitle').textContent = 'OTP Verification';
    document.getElementById('modalSub').textContent = 'Step 2 of 2 - Verify your identity';
  }
}

function togglePwd() {
  const passwordInput = document.getElementById('empPwd');
  const button = document.getElementById('eyeBtn');
  passwordInput.type = passwordInput.type === 'password' ? 'text' : 'password';
  button.textContent = passwordInput.type === 'password' ? 'Show' : 'Hide';
}

function showError(elementId, message) {
  const element = document.getElementById(elementId);
  element.textContent = message;
  element.classList.add('show');
}

async function doSignup() {
  const name = document.getElementById('signupName').value.trim();
  const role = document.getElementById('signupRole').value;
  const mobile = document.getElementById('signupMobile').value.trim();
  const email = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPwd').value;
  const confirmPassword = document.getElementById('signupConfirmPwd').value;

  if (!name || !role || !mobile || !password || !confirmPassword) {
    showError('signupErr', 'Please fill in all required signup fields.');
    return;
  }

  if (!/^\d{10}$/.test(mobile)) {
    showError('signupErr', 'Please enter a valid 10-digit mobile number.');
    return;
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showError('signupErr', 'Please enter a valid email address.');
    return;
  }

  if (password.length < 4) {
    showError('signupErr', 'Password must be at least 4 characters.');
    return;
  }

  if (password !== confirmPassword) {
    showError('signupErr', 'Passwords do not match.');
    return;
  }

  const button = document.getElementById('createAccountBtn');
  button.textContent = 'Creating...';
  button.disabled = true;

  try {
    const data = await apiRequest('/signup', {
      method: 'POST',
      body: JSON.stringify({ name, role, mobile, email, password, confirmPassword })
    });

    if (data.success) {
      document.getElementById('signupErr').classList.remove('show');
      const success = document.getElementById('signupSuccess');
      const generatedEmpId = data.employee?.emp_id || data.employee?.empId || '';
      const notificationParts = [];
      if (data.notifications?.email?.message) notificationParts.push(`Email: ${data.notifications.email.message}`);
      if (data.notifications?.sms?.message) notificationParts.push(`SMS: ${data.notifications.sms.message}`);
      success.textContent = [
        data.message || `Account created successfully. Your RINL ID is ${generatedEmpId}. Use this ID to log in.`,
        ...notificationParts
      ].join(' ');
      success.classList.remove('hidden');
      document.getElementById('empId').value = generatedEmpId;
      document.getElementById('empRole').value = role;
      document.getElementById('empMobile').value = mobile;
      document.getElementById('empEmail').value = email;
      localStorage.setItem('rinlSelectedRole', role);
      setTimeout(() => showAuthMode('login'), 1800);
    } else {
      showError('signupErr', data.message || 'Unable to create account.');
    }
  } catch (err) {
    showError('signupErr', err.message || 'Cannot connect to server. Make sure server.js is running.');
  } finally {
    button.textContent = 'Create Account';
    button.disabled = false;
  }
}

function showOtpTarget(value, devOtp) {
  const target = document.getElementById('maskedValue');
  target.textContent = maskOtpTarget(value);
  if (devOtp) {
    target.textContent += ` (Dev OTP: ${devOtp})`;
  }
}

async function doLogin() {
  localStorage.removeItem('rinlSession');
  const empId = document.getElementById('empId').value.trim();
  const role = document.getElementById('empRole').value;
  const password = document.getElementById('empPwd').value;
  const value = otpMethod === 'phone'
    ? document.getElementById('empMobile').value.trim()
    : document.getElementById('empEmail').value.trim();

  if (!empId || !role || !password || !value) {
    showError('errBox', 'Please fill in all fields to continue.');
    return;
  }

  if (otpMethod === 'phone' && !/^\d{10}$/.test(value)) {
    showError('errBox', 'Please enter a valid 10-digit mobile number.');
    return;
  }

  if (otpMethod === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    showError('errBox', 'Please enter a valid email address.');
    return;
  }

  loginContext = { empId, role, password };
  localStorage.setItem('rinlSelectedRole', role);
  otpTarget = value;

  const button = document.querySelector('#stepLogin .signin-btn');
  button.textContent = 'Sending OTP...';
  button.disabled = true;

  try {
    const data = await apiRequest('/send-otp', {
      method: 'POST',
      body: JSON.stringify({ type: otpMethod, value, empId, password, role })
    });

    if (data.success) {
      showOtpTarget(value, data.devOtp);
      clearOtpBoxes();
      showStep('otp');
      startOtpTimer();
      startResendTimer();
      setTimeout(() => document.getElementById('otp0').focus(), 100);
    } else {
      showError('errBox', data.message || 'Failed to send OTP. Try again.');
    }
  } catch (err) {
    showError('errBox', err.message || 'Cannot connect to server. Make sure server.js is running.');
  } finally {
    button.textContent = 'Send OTP & Continue';
    button.disabled = false;
  }
}

function maskOtpTarget(value) {
  if (otpMethod === 'phone') return `+91 ${value.substring(0, 2)}XXXXXX${value.substring(8)}`;
  const [name, domain] = value.split('@');
  return `${name.substring(0, 3)}****@${domain}`;
}

function startOtpTimer() {
  clearInterval(timerInterval);
  let seconds = 120;
  updateTimerDisplay(seconds);
  timerInterval = setInterval(() => {
    seconds -= 1;
    updateTimerDisplay(seconds);
    if (seconds <= 0) {
      clearInterval(timerInterval);
      const element = document.getElementById('otpTimerDisplay');
      element.textContent = 'Expired';
      element.style.color = 'var(--red)';
    }
  }, 1000);
}

function updateTimerDisplay(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  const element = document.getElementById('otpTimerDisplay');
  element.style.color = seconds <= 30 ? 'var(--red)' : 'var(--blue)';
  element.textContent = `${minutes}:${remaining < 10 ? '0' : ''}${remaining}`;
}

function startResendTimer() {
  clearInterval(resendInterval);
  document.getElementById('resendBtn').disabled = true;
  let seconds = 30;
  document.getElementById('resendTimer').textContent = ` (${seconds}s)`;
  resendInterval = setInterval(() => {
    seconds -= 1;
    if (seconds <= 0) {
      clearInterval(resendInterval);
      document.getElementById('resendBtn').disabled = false;
      document.getElementById('resendTimer').textContent = '';
    } else {
      document.getElementById('resendTimer').textContent = ` (${seconds}s)`;
    }
  }, 1000);
}

function otpNext(input, index) {
  input.value = input.value.replace(/\D/g, '');
  if (input.value) {
    input.classList.add('filled');
    input.classList.remove('error');
    if (index < 5) document.getElementById(`otp${index + 1}`).focus();
    else document.getElementById('verifyBtn').click();
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
  return Array.from({ length: 6 }, (_, index) => document.getElementById(`otp${index}`).value).join('');
}

function clearOtpBoxes() {
  for (let index = 0; index < 6; index += 1) {
    const box = document.getElementById(`otp${index}`);
    box.value = '';
    box.classList.remove('filled', 'error', 'success');
  }
}

function formatDashboardDate(date) {
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  }).format(date);
}

function showDashboardWelcome(destination, employee) {
  const existingFlash = document.getElementById('dashboardWelcomeFlash');
  if (existingFlash) existingFlash.remove();

  const name = employee?.name || loginContext.empId || 'RINL Member';
  const role = employee?.role || loginContext.role || 'Dashboard';
  const today = formatDashboardDate(new Date());
  const flash = document.createElement('div');
  flash.className = 'dashboard-welcome-flash';
  flash.id = 'dashboardWelcomeFlash';

  const shade = document.createElement('div');
  shade.className = 'dashboard-welcome-shade';

  const panel = document.createElement('div');
  panel.className = 'dashboard-welcome-panel';

  const dateLine = document.createElement('p');
  dateLine.className = 'dashboard-welcome-date';
  dateLine.textContent = today;

  const title = document.createElement('h1');
  title.textContent = `Welcome, ${name}`;

  const message = document.createElement('p');
  message.className = 'dashboard-welcome-message';
  message.textContent = `Your ${role} dashboard is getting ready.`;

  const quote = document.createElement('p');
  quote.className = 'dashboard-welcome-quote';
  quote.textContent = '"Building trust, strength, and progress for every working day."';

  panel.append(dateLine, title, message, quote);
  flash.append(shade, panel);

  document.body.appendChild(flash);
  requestAnimationFrame(() => flash.classList.add('active'));

  setTimeout(() => {
    flash.classList.add('dashboard-welcome-hide');
    setTimeout(() => {
      window.location.href = destination;
    }, 450);
  }, 3000);
}

async function verifyOtp() {
  const entered = getEnteredOtp();
  if (entered.length < 6) {
    showError('errOtp', 'Please enter all 6 digits of the OTP.');
    return;
  }

  const button = document.getElementById('verifyBtn');
  button.textContent = 'Verifying...';
  button.disabled = true;

  try {
    const data = await apiRequest('/verify-otp', {
      method: 'POST',
      body: JSON.stringify({
        type: otpMethod,
        value: otpTarget,
        otp: entered,
        empId: loginContext.empId,
        role: loginContext.role
      })
    });

    if (data.success) {
      const employee = {
        ...(data.employee || {}),
        empId: data.employee?.empId || loginContext.empId,
        name: data.employee?.name || loginContext.empId,
        role: loginContext.role || data.employee?.role || 'Workers'
      };
      document.getElementById('errOtp').classList.remove('show');
      for (let index = 0; index < 6; index += 1) document.getElementById(`otp${index}`).classList.add('success');
      document.getElementById('successOtp').classList.remove('hidden');
      clearInterval(timerInterval);
      clearInterval(resendInterval);
      localStorage.setItem('rinlSession', JSON.stringify({ sessionId: data.sessionId, employee }));
      setTimeout(() => {
        const destinationRole = String(employee.role || '').toLowerCase();
        const destination = window.roleDestination ? roleDestination(destinationRole) : 'index.html';
        showDashboardWelcome(destination, employee);
      }, 900);
    } else {
      showError('errOtp', data.message || 'Invalid OTP. Please try again.');
      for (let index = 0; index < 6; index += 1) {
        document.getElementById(`otp${index}`).classList.add('error');
        document.getElementById(`otp${index}`).classList.remove('filled');
      }
      setTimeout(() => {
        clearOtpBoxes();
        document.getElementById('otp0').focus();
      }, 700);
      button.textContent = 'Verify OTP & Login';
      button.disabled = false;
    }
  } catch (err) {
    showError('errOtp', err.message || 'Cannot connect to server. Make sure server.js is running.');
    button.textContent = 'Verify OTP & Login';
    button.disabled = false;
  }
}

async function resendOtp() {
  const button = document.getElementById('resendBtn');
  button.textContent = 'Sending...';
  button.disabled = true;

  try {
    const data = await apiRequest('/send-otp', {
      method: 'POST',
      body: JSON.stringify({
        type: otpMethod,
        value: otpTarget,
        empId: loginContext.empId,
        password: loginContext.password,
        role: loginContext.role
      })
    });

    if (data.success) {
      document.getElementById('errOtp').classList.remove('show');
      showOtpTarget(otpTarget, data.devOtp);
      document.getElementById('otpTimerDisplay').style.color = 'var(--blue)';
      clearOtpBoxes();
      startOtpTimer();
      startResendTimer();
      document.getElementById('otp0').focus();
    } else {
      showError('errOtp', data.message || 'Failed to resend OTP.');
      button.disabled = false;
    }
  } catch (err) {
    showError('errOtp', err.message || 'Server error. Make sure server.js is running.');
    button.disabled = false;
  } finally {
    button.textContent = 'Resend OTP';
  }
}

function goBack() {
  clearInterval(timerInterval);
  clearInterval(resendInterval);
  showStep('login');
}

document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener('click', (event) => {
    const href = anchor.getAttribute('href');
    if (!href || href === '#') return;
    const target = document.querySelector(href);
    if (target) {
      event.preventDefault();
      target.scrollIntoView({ behavior: 'smooth' });
    }
  });
});

function initFlashcards3D() {
  const stage = document.querySelector('[data-flash-stage]');
  if (!stage) return;

  const cards = Array.from(stage.querySelectorAll('.flashcard'));
  const dots = Array.from(document.querySelectorAll('[data-flash-dot]'));
  const previousButton = document.querySelector('[data-flash-prev]');
  const nextButton = document.querySelector('[data-flash-next]');
  const continueButton = document.querySelector('[data-flash-continue]');
  const landing = document.getElementById('landing');
  let activeIndex = 0;
  let dragStartX = 0;
  let dragStartY = 0;
  let isDragging = false;
  let didSwipe = false;

  const setActive = (index) => {
    activeIndex = (index + cards.length) % cards.length;
    cards.forEach((card, cardIndex) => card.classList.toggle('active', cardIndex === activeIndex));
    dots.forEach((dot, dotIndex) => dot.classList.toggle('active', dotIndex === activeIndex));
    if (continueButton) {
      continueButton.textContent = `Continue as ${cards[activeIndex].dataset.role || 'selected role'}`;
    }
  };

  const showNextCard = () => setActive(activeIndex + 1);
  const showPreviousCard = () => setActive(activeIndex - 1);

  const openLandingForRole = (index) => {
    setActive(index);
    const selectedCard = cards[index];
    const selectedRole = selectedCard.dataset.role || '';
    if (selectedRole) localStorage.setItem('rinlSelectedRole', selectedRole);
    cards.forEach((card, cardIndex) => card.classList.toggle('selected', cardIndex === index));
    setTimeout(() => {
      if (landing) {
        landing.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        window.location.href = 'index.html';
      }
    }, 220);
  };

  cards.forEach((card, index) => {
    card.addEventListener('focus', () => setActive(index));
    card.addEventListener('click', (event) => {
      if (didSwipe) {
        event.preventDefault();
        didSwipe = false;
        return;
      }
      if (index !== activeIndex) {
        setActive(index);
        return;
      }
      openLandingForRole(index);
    });
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openLandingForRole(index);
      } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault();
        showNextCard();
        cards[activeIndex].focus();
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault();
        showPreviousCard();
        cards[activeIndex].focus();
      }
    });
  });

  previousButton?.addEventListener('click', showPreviousCard);
  nextButton?.addEventListener('click', showNextCard);
  continueButton?.addEventListener('click', () => openLandingForRole(activeIndex));

  dots.forEach((dot) => {
    dot.addEventListener('click', () => {
      const index = Number(dot.dataset.flashDot);
      if (!Number.isNaN(index)) setActive(index);
    });
  });

  stage.addEventListener('pointerdown', (event) => {
    isDragging = true;
    didSwipe = false;
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    stage.setPointerCapture?.(event.pointerId);
    stage.classList.add('is-swiping');
  });

  stage.addEventListener('pointerup', (event) => {
    if (!isDragging) return;
    const deltaX = event.clientX - dragStartX;
    const deltaY = event.clientY - dragStartY;
    const isHorizontalSwipe = Math.abs(deltaX) > 45 && Math.abs(deltaX) > Math.abs(deltaY);

    if (isHorizontalSwipe) {
      didSwipe = true;
      if (deltaX < 0) showNextCard();
      else showPreviousCard();
      setTimeout(() => {
        didSwipe = false;
      }, 80);
    }

    isDragging = false;
    stage.classList.remove('is-swiping');
  });

  stage.addEventListener('pointercancel', () => {
    isDragging = false;
    stage.classList.remove('is-swiping');
  });

  stage.addEventListener('mousemove', (event) => {
    const rect = stage.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width - 0.5) * 16;
    const y = ((event.clientY - rect.top) / rect.height - 0.5) * -12;
    stage.style.transform = `rotateX(${y}deg) rotateY(${x}deg)`;
  });

  stage.addEventListener('mouseleave', () => {
    stage.style.transform = '';
  });

  setActive(0);
}

document.addEventListener('DOMContentLoaded', () => {
  initFlashcards3D();
});
