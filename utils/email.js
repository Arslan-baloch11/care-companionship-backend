const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 465),
  secure: String(process.env.SMTP_SECURE) === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function sendVerificationEmail({
  email,
  name,
  code,
}) {
  const mailOptions = {
    from:
      process.env.EMAIL_FROM ||
      process.env.SMTP_USER,

    to: email,

    subject:
      'Homecare Companionship - Email Verification Code',

    text: `Hello ${name || 'User'},

Your Homecare Companionship verification code is:

${code}

This code will expire in 10 minutes.

If you did not create this account, you can ignore this email.

Homecare Companionship`,

    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:30px;background:#f6f8fb;">
        <div style="background:#ffffff;padding:30px;border-radius:16px;">
          <h2 style="margin:0 0 10px;color:#111827;">
            Homecare Companionship
          </h2>

          <p style="color:#4b5563;font-size:16px;">
            Hello ${name || 'User'},
          </p>

          <p style="color:#4b5563;font-size:16px;">
            Use the verification code below to verify your email address:
          </p>

          <div style="text-align:center;margin:30px 0;">
            <span style="
              display:inline-block;
              background:#eef6ff;
              color:#2563eb;
              font-size:32px;
              font-weight:800;
              letter-spacing:8px;
              padding:18px 28px;
              border-radius:12px;
            ">
              ${code}
            </span>
          </div>

          <p style="color:#6b7280;font-size:14px;">
            This code will expire in 10 minutes.
          </p>

          <p style="color:#6b7280;font-size:14px;">
            If you did not create this account, you can safely ignore this email.
          </p>

          <hr style="border:none;border-top:1px solid #e5e7eb;margin:25px 0;">

          <p style="color:#9ca3af;font-size:12px;">
            Homecare Companionship
          </p>
        </div>
      </div>
    `,
  };

  return transporter.sendMail(mailOptions);
}

async function verifyEmailTransport() {
  return transporter.verify();
}

module.exports = {
  sendVerificationEmail,
  verifyEmailTransport,
};