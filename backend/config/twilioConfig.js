const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

function envValue(name) {
  return (process.env[name] || '').trim();
}

module.exports = {
  accountSid: envValue('TWILIO_SID'),
  authToken: envValue('TWILIO_AUTH_TOKEN'),
  verifyServiceSid: envValue('TWILIO_VERIFY_SID'),
  phoneNumber: envValue('TWILIO_PHONE_NUMBER') || envValue('TWILIO_FROM_PHONE'),
  messagingServiceSid: envValue('TWILIO_MESSAGING_SERVICE_SID'),
  signupNotifyPhone: envValue('SIGNUP_NOTIFY_PHONE') || envValue('ADMIN_PHONE') || envValue('OWNER_PHONE')
};
