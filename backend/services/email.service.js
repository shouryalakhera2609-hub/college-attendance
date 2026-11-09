const nodemailer = require('nodemailer');

let transporter;

function getTransporter() {
  const { EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS } = process.env;
  if (!EMAIL_HOST || !EMAIL_PORT || !EMAIL_USER || !EMAIL_PASS || !process.env.EMAIL_FROM) {
    throw new Error('SMTP email settings are incomplete.');
  }
  if (!transporter) {
    const port = Number(EMAIL_PORT);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('EMAIL_PORT is invalid.');
    transporter = nodemailer.createTransport({
      host: EMAIL_HOST,
      port,
      secure: port === 465,
      auth: { user: EMAIL_USER, pass: EMAIL_PASS },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000
    });
  }
  return transporter;
}

exports.sendRegistrationOtp = (email, name, otp, expiryMinutes) => getTransporter().sendMail({
  from: process.env.EMAIL_FROM,
  to: email,
  subject: 'Verify your CampusAttend student account',
  text: `Hello ${name},\n\nYour CampusAttend verification code is ${otp}. It expires in ${expiryMinutes} minutes. If you did not request this, you can ignore this email.`
});

exports.sendPasswordResetOtp = (email, name, otp, expiryMinutes) => getTransporter().sendMail({
  from: process.env.EMAIL_FROM,
  to: email,
  subject: 'Reset your CampusAttend password',
  text: `Hello ${name},\n\nYour CampusAttend password reset code is ${otp}. It expires in ${expiryMinutes} minutes. If you did not request this, you can ignore this email.`
});
