const nodemailer = require('nodemailer');
const mailConfig = require('../config/mailConfig');

const transporter = nodemailer.createTransport({
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

transporter.verify((err, success) => {
  if (err) {
    console.error("SMTP VERIFY ERROR:");
    console.error(err);
  } else {
    console.log("SMTP VERIFIED");
  }
});

module.exports = transporter;