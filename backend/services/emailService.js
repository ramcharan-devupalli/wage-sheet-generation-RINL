const nodemailer = require('nodemailer');
const mailConfig = require('../config/mailConfig');
module.exports = nodemailer.createTransport({ service: 'gmail', auth: { user: mailConfig.gmailUser, pass: mailConfig.gmailPass } });

