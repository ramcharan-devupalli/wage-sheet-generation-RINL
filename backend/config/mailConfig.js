const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

function envValue(name) {
  return (process.env[name] || '').trim();
}

function gmailAppPassword() {
  return envValue('EMAIL_PASSWORD').replace(/\s+/g, '');
}

module.exports = {
  gmailUser: envValue('EMAIL'),
  gmailPass: gmailAppPassword(),
  signupNotifyEmail: envValue('SIGNUP_NOTIFY_EMAIL') || envValue('ADMIN_EMAIL') || envValue('EMAIL')
};
