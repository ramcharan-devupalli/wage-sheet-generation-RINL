const API_BASE = "http://localhost:5000/api/auth";

const authOverlay = document.getElementById("authOverlay");
const openLoginBtn = document.getElementById("openLoginBtn");
const heroSignupBtn = document.getElementById("heroSignupBtn");
const closeModalBtn = document.getElementById("closeModalBtn");

const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");
const otpForm = document.getElementById("otpForm");

const showSignupBtn = document.getElementById("showSignupBtn");
const showLoginBtn = document.getElementById("showLoginBtn");
const backToSignupBtn = document.getElementById("backToSignupBtn");
const resendOtpBtn = document.getElementById("resendOtpBtn");

const modalTitle = document.getElementById("modalTitle");
const modalSubtitle = document.getElementById("modalSubtitle");
const messageBox = document.getElementById("messageBox");
const otpTarget = document.getElementById("otpTarget");

const otpBoxes = document.querySelectorAll(".otp-box");

let currentSignupEmail = "";

function showMessage(message, type = "error") {
  messageBox.textContent = message;
  messageBox.classList.add("show");

  if (type === "success") {
    messageBox.style.background = "#f0fff4";
    messageBox.style.borderColor = "#b2dfcc";
    messageBox.style.color = "#1a7a3a";
  } else {
    messageBox.style.background = "#fff0f0";
    messageBox.style.borderColor = "#ffc0c0";
    messageBox.style.color = "#c0001e";
  }
}

function clearMessage() {
  messageBox.textContent = "";
  messageBox.classList.remove("show");
}

function showForm(formName) {
  loginForm.classList.remove("active");
  signupForm.classList.remove("active");
  otpForm.classList.remove("active");
  clearMessage();

  if (formName === "login") {
    loginForm.classList.add("active");
    modalTitle.textContent = "Login";
    modalSubtitle.textContent = "Access your dashboard";
  }

  if (formName === "signup") {
    signupForm.classList.add("active");
    modalTitle.textContent = "Signup";
    modalSubtitle.textContent = "Create your account";
  }

  if (formName === "otp") {
    otpForm.classList.add("active");
    modalTitle.textContent = "Verify OTP";
    modalSubtitle.textContent = "Email verification required";
  }
}

function openModal(formName = "login") {
  authOverlay.classList.add("active");
  showForm(formName);
}

function closeModal() {
  authOverlay.classList.remove("active");
}

openLoginBtn.addEventListener("click", () => openModal("login"));
heroSignupBtn.addEventListener("click", () => openModal("signup"));
closeModalBtn.addEventListener("click", closeModal);

showSignupBtn.addEventListener("click", () => showForm("signup"));
showLoginBtn.addEventListener("click", () => showForm("login"));
backToSignupBtn.addEventListener("click", () => showForm("signup"));

otpBoxes.forEach((box, index) => {
  box.addEventListener("input", () => {
    box.value = box.value.replace(/[^0-9]/g, "");

    if (box.value && index < otpBoxes.length - 1) {
      otpBoxes[index + 1].focus();
    }
  });

  box.addEventListener("keydown", (e) => {
    if (e.key === "Backspace" && !box.value && index > 0) {
      otpBoxes[index - 1].focus();
    }
  });
});

function getOtpValue() {
  return Array.from(otpBoxes).map((box) => box.value).join("");
}

function clearOtpBoxes() {
  otpBoxes.forEach((box) => {
    box.value = "";
  });
}

signupForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = document.getElementById("signupName").value.trim();
  const email = document.getElementById("signupEmail").value.trim();
  const mobile = document.getElementById("signupMobile").value.trim();
  const role = document.getElementById("signupRole").value;
  const password = document.getElementById("signupPassword").value;

  if (mobile.length !== 10) {
    showMessage("Mobile number must be 10 digits");
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/signup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        email,
        mobile,
        role,
        password,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      showMessage(data.message || "Signup failed");
      return;
    }

    currentSignupEmail = email;
    otpTarget.textContent = email;
    clearOtpBoxes();
    showForm("otp");
    showMessage("OTP sent to your email", "success");
  } catch (error) {
    showMessage("Backend not reachable. Check if server is running.");
  }
});

otpForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const otp = getOtpValue();

  if (otp.length !== 6) {
    showMessage("Enter complete 6 digit OTP");
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/verify-email-otp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: currentSignupEmail,
        otp,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      showMessage(data.message || "OTP verification failed");
      return;
    }

    showForm("login");
    showMessage("Email verified successfully. You can login now.", "success");
  } catch (error) {
    showMessage("Backend not reachable. Check if server is running.");
  }
});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;

  try {
    const response = await fetch(`${API_BASE}/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        password,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      showMessage(data.message || "Login failed");
      return;
    }

    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));
    localStorage.setItem("role", data.user.role);

    showMessage("Login successful", "success");

    setTimeout(() => {
      if (data.user.role === "admin") {
        window.location.href = "admin.html";
      } else if (data.user.role === "contractor") {
        window.location.href = "contractor.html";
      } else {
        window.location.href = "worker.html";
      }
    }, 800);
  } catch (error) {
    showMessage("Backend not reachable. Check if server is running.");
  }
});

resendOtpBtn.addEventListener("click", async () => {
  showMessage("For now, signup again with a new email/mobile to resend OTP.");
});