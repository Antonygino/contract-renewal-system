require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Document = require('./models/Document');

const seedData = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/renewal_tracker');
    console.log('MongoDB connected for seeding...');

    // 1. Ensure Admin User
    let admin = await User.findOne({ email: 'admin@renewaltrack.com' });
    if (!admin) {
      admin = await User.create({
        name: 'System Admin',
        email: 'admin@renewaltrack.com',
        password: 'Admin@1234',
        role: 'admin',
        organization: 'RenewalTrack Corp'
      });
      console.log('Created admin: admin@renewaltrack.com / Admin@1234');
    } else {
      admin.password = 'Admin@1234';
      await admin.save();
      console.log('Updated admin password to Admin@1234');
    }

    // 2. Ensure Student/Demo User
    let student = await User.findOne({ email: 'fsd@test.com' });
    if (!student) {
      student = await User.create({
        name: 'FSD Student',
        email: 'fsd@test.com',
        password: 'Test@1234',
        role: 'user',
        organization: 'FSD Engineering College'
      });
      console.log('Created user: fsd@test.com / Test@1234');
    } else {
      student.password = 'Test@1234';
      await student.save();
      console.log('Updated user password to Test@1234');
    }

    // 3. Clear existing demo documents for fsd@test.com to seed fresh sample data
    await Document.deleteMany({ user: student._id });

    const now = new Date();
    const daysFromNow = (days) => {
      const d = new Date();
      d.setDate(now.getDate() + days);
      return d;
    };
    const daysAgo = (days) => {
      const d = new Date();
      d.setDate(now.getDate() - days);
      return d;
    };

    const sampleDocs = [
      {
        user: student._id,
        title: 'AWS Enterprise Cloud Infrastructure',
        type: 'Contract',
        issuer: 'Amazon Web Services Inc.',
        description: 'Annual cloud hosting and Kubernetes cluster hosting agreement.',
        issueDate: daysAgo(180),
        expiryDate: daysFromNow(185),
        cost: 45000,
        currency: 'INR',
        tags: ['Cloud', 'Infrastructure', 'Hosting'],
        reminderDays: 30
      },
      {
        user: student._id,
        title: 'Microsoft 365 Business Standard',
        type: 'License',
        issuer: 'Microsoft Corporation',
        description: '50 user seats for Outlook, Teams, Word, and Excel suite.',
        issueDate: daysAgo(350),
        expiryDate: daysFromNow(15),
        cost: 28500,
        currency: 'INR',
        tags: ['Productivity', 'Office', 'Software'],
        reminderDays: 30
      },
      {
        user: student._id,
        title: 'HQ Office Lease & Rental Agreement',
        type: 'Contract',
        issuer: 'Skyline Business Parks Pvt Ltd',
        description: 'Commercial corporate office lease - Tower B, 4th Floor.',
        issueDate: daysAgo(360),
        expiryDate: daysFromNow(5),
        cost: 120000,
        currency: 'INR',
        tags: ['Facility', 'RealEstate', 'Legal'],
        reminderDays: 60
      },
      {
        user: student._id,
        title: 'Wildcard SSL/TLS Certificate (*.renewaltrack.dev)',
        type: 'Certification',
        issuer: 'DigiCert Global CA',
        description: 'Domain SSL certificate securing production and staging endpoints.',
        issueDate: daysAgo(363),
        expiryDate: daysFromNow(2),
        cost: 8500,
        currency: 'INR',
        tags: ['Security', 'DevOps', 'SSL'],
        reminderDays: 15
      },
      {
        user: student._id,
        title: 'Corporate Health & Accident Insurance',
        type: 'Insurance',
        issuer: 'HDFC ERGO General Insurance',
        description: 'Group medical and health policy covering 35 full-time employees.',
        issueDate: daysAgo(375),
        expiryDate: daysAgo(10),
        cost: 65000,
        currency: 'INR',
        tags: ['HR', 'Benefits', 'Insurance'],
        reminderDays: 30
      },
      {
        user: student._id,
        title: 'Dell PowerEdge Server Extended Warranty',
        type: 'Warranty',
        issuer: 'Dell Technologies India',
        description: '24/7 mission critical hardware replacement and on-site support.',
        issueDate: daysAgo(700),
        expiryDate: daysAgo(35),
        cost: 18000,
        currency: 'INR',
        tags: ['Hardware', 'ITSupport', 'Warranty'],
        reminderDays: 30
      },
      {
        user: student._id,
        title: 'Salesforce Enterprise CRM Subscription',
        type: 'License',
        issuer: 'Salesforce.com Inc.',
        description: 'Sales and customer pipeline management platform.',
        issueDate: daysAgo(90),
        expiryDate: daysFromNow(275),
        cost: 72000,
        currency: 'INR',
        tags: ['Sales', 'CRM', 'SaaS'],
        reminderDays: 45
      }
    ];

    for (const doc of sampleDocs) {
      await Document.create(doc);
    }

    console.log(`Successfully seeded ${sampleDocs.length} documents for ${student.email}!`);
    process.exit(0);
  } catch (error) {
    console.error('Seeding error:', error);
    process.exit(1);
  }
};

seedData();
