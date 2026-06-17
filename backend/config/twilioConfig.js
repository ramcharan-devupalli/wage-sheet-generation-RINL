function envValue(name) {
  return (process.env[name] || '').trim();
}

module.exports = {
  accountSid: envValue('TWILIO_SID'),
  authToken: envValue('TWILIO_AUTH_TOKEN'),
  verifyServiceSid: envValue('TWILIO_VERIFY_SID')
};
