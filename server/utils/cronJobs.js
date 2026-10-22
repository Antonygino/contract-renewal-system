const cron = require('node-cron');
const Document = require('../models/Document');
const User = require('../models/User');
const { sendRenewalReminder } = require('../utils/emailService');

// Run every day at 8:00 AM
const startRenewalCron = () => {
  cron.schedule('0 8 * * *', async () => {
    console.log('🕐 Running renewal reminder cron job...');

    try {
      const reminderThresholds = [30, 14, 7, 3, 1];

      const now = new Date();

      for (const days of reminderThresholds) {
        const targetDate = new Date(now);
        targetDate.setDate(targetDate.getDate() + days);

        // Find docs expiring on that day that haven't been reminded
        const docs = await Document.find({
          expiryDate: {
            $gte: new Date(targetDate.setHours(0, 0, 0, 0)),
            $lte: new Date(targetDate.setHours(23, 59, 59, 999)),
          },
          status: { $in: ['Active', 'Expiring Soon'] },
        }).populate('user', 'name email');

        for (const doc of docs) {
          if (doc.user && doc.user.email) {
            try {
              await sendRenewalReminder({
                to: doc.user.email,
                userName: doc.user.name,
                documentTitle: doc.title,
                documentType: doc.type,
                daysLeft: days,
                expiryDate: doc.expiryDate,
              });
              console.log(`📧 Reminder sent to ${doc.user.email} for "${doc.title}" (${days} days left)`);
            } catch (emailError) {
              console.error(`❌ Email failed for ${doc.user.email}:`, emailError.message);
            }
          }
        }
      }

      // Update statuses
      await Document.updateMany(
        { expiryDate: { $lt: now }, status: { $ne: 'Expired' } },
        { $set: { status: 'Expired' } }
      );

      await Document.updateMany(
        {
          expiryDate: {
            $gte: now,
            $lte: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
          },
          status: 'Active',
        },
        { $set: { status: 'Expiring Soon' } }
      );

      console.log('✅ Renewal cron job completed');
    } catch (error) {
      console.error('❌ Cron job error:', error.message);
    }
  });

  console.log('⏰ Renewal reminder cron job scheduled (daily at 8:00 AM)');
};

module.exports = { startRenewalCron };
