const twilio = require('twilio');
const twilioConfig = require('../config/twilioConfig');
module.exports = twilioConfig.accountSid ? twilio(twilioConfig.accountSid, twilioConfig.authToken) : null;

