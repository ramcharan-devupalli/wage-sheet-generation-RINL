const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

module.exports = {
  sendMail: async ({ to, subject, text, html }) => {
    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not configured');
    }

    const result = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'onboarding@resend.dev',
      to,
      subject,
      text,
      html,
    });

    if (result.error) {
      throw new Error(result.error.message);
    }

    return result;
  },
};
