const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

function envValue(name) {
  return (process.env[name] || '').trim();
}

function gmailAppPassword() {
  return envValue('EMAIL_PASSWORD').replace(/\s+/g, '');
}

console.log("========== MAIL CONFIG ==========");
console.log("EMAIL:", envValue("EMAIL"));
console.log("PASSWORD EXISTS:", !!process.env.EMAIL_PASSWORD);
console.log("PASSWORD LENGTH:", gmailAppPassword().length);
console.log("=================================");

module.exports = {
  gmailUser: envValue('EMAIL'),
  gmailPass: gmailAppPassword(),
  signupNotifyEmail: envValue('SIGNUP_NOTIFY_EMAIL') || envValue('ADMIN_EMAIL') || envValue('EMAIL'),
  loginNotifyEmail: envValue('LOGIN_NOTIFY_EMAIL') || envValue('SIGNUP_NOTIFY_EMAIL') || envValue('ADMIN_EMAIL') || envValue('EMAIL')
};