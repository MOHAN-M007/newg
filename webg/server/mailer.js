"use strict";

const nodemailer = require("nodemailer");

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const FROM_EMAIL = process.env.FROM_EMAIL || SMTP_USER;

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
  return transporter;
}

async function sendWelcomeEmail(to, uid, password) {
  const mail = {
    from: FROM_EMAIL,
    to,
    subject: "Your Retro Arena Credentials",
    text: `Welcome to Retro Arena!\n\nUID: ${uid}\nPassword: ${password}\n\nKeep these safe.`
  };
  const t = getTransporter();
  await t.sendMail(mail);
}

module.exports = { sendWelcomeEmail };
