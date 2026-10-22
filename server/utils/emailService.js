const nodemailer = require('nodemailer');

const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT),
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
};

const sendRenewalReminder = async ({ to, userName, documentTitle, documentType, daysLeft, expiryDate }) => {
  const transporter = createTransporter();

  const urgencyColor = daysLeft <= 7 ? '#dc2626' : daysLeft <= 14 ? '#d97706' : '#4f46e5';
  const urgencyLabel = daysLeft <= 7 ? 'URGENT' : daysLeft <= 14 ? 'SOON' : 'UPCOMING';

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"></head>
    <body style="font-family: Arial, sans-serif; background: #f3f4f6; margin: 0; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
        <div style="background: linear-gradient(135deg, #4f46e5, #7c3aed); padding: 30px; text-align: center;">
          <h1 style="color: #fff; margin: 0; font-size: 22px;">🔔 Renewal Alert</h1>
          <p style="color: #c7d2fe; margin: 8px 0 0;">Contract & Document Renewal Tracker</p>
        </div>
        <div style="padding: 30px;">
          <p style="color: #374151; font-size: 15px;">Hello <strong>${userName}</strong>,</p>
          <p style="color: #374151;">This is a reminder that the following document is due for renewal:</p>
          
          <div style="background: #f9fafb; border-left: 4px solid ${urgencyColor}; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <span style="background: ${urgencyColor}; color: #fff; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: bold;">${urgencyLabel}</span>
            <h2 style="color: #1f2937; margin: 12px 0 6px;">${documentTitle}</h2>
            <p style="color: #6b7280; margin: 0; font-size: 14px;">Type: <strong>${documentType}</strong></p>
            <p style="color: #6b7280; margin: 6px 0 0; font-size: 14px;">Expires on: <strong style="color: ${urgencyColor};">${new Date(expiryDate).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}</strong></p>
            <p style="color: #6b7280; margin: 6px 0 0; font-size: 14px;">Days remaining: <strong style="color: ${urgencyColor}; font-size: 20px;">${daysLeft}</strong> days</p>
          </div>
          
          <p style="color: #374151;">Please take action to renew this document before it expires to avoid any disruptions.</p>
          
          <div style="text-align: center; margin-top: 24px;">
            <a href="http://localhost:5173/documents" style="background: linear-gradient(135deg, #4f46e5, #7c3aed); color: #fff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">View Document →</a>
          </div>
        </div>
        <div style="background: #f9fafb; padding: 16px; text-align: center; color: #9ca3af; font-size: 12px;">
          <p style="margin: 0;">© 2024 Renewal Tracker | MERN Stack Project</p>
        </div>
      </div>
    </body>
    </html>
  `;

  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: `[${urgencyLabel}] ${documentTitle} expires in ${daysLeft} days`,
    html,
  });
};

module.exports = { sendRenewalReminder };
