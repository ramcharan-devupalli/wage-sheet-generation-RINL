const nodemailer = require('nodemailer');
const mailConfig = require('../config/mailConfig');

module.exports = nodemailer.createTransport({
  service: 'gmail',
  pool: true,
  maxConnections: 2,
  maxMessages: 100,
  auth: { user: mailConfig.gmailUser, pass: mailConfig.gmailPass },
  connectionTimeout: 15000,
  greetingTimeout: 15000,
  socketTimeout: 20000
});
