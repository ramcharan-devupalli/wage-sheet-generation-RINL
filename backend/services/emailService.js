const nodemailer = require('nodemailer');
const mailConfig = require('../config/mailConfig');

module.exports = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: mailConfig.gmailUser,
    pass: mailConfig.gmailPass
  },
  connectionTimeout: 30000,
  greetingTimeout: 30000,
  socketTimeout: 60000
});