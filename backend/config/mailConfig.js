function envValue(name) {
  return (process.env[name] || '').trim();
}

module.exports = {
  gmailUser: envValue('EMAIL'),
  gmailPass: envValue('EMAIL_PASSWORD')
};
