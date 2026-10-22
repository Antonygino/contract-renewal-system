const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Document title is required'],
      trim: true,
      maxlength: [100, 'Title cannot exceed 100 characters'],
    },
    type: {
      type: String,
      required: [true, 'Document type is required'],
      enum: ['Contract', 'License', 'Certification', 'Warranty', 'Insurance', 'Permit', 'Other'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
    },
    issuer: {
      type: String,
      trim: true,
      required: [true, 'Issuer is required'],
    },
    issueDate: {
      type: Date,
      required: [true, 'Issue date is required'],
    },
    expiryDate: {
      type: Date,
      required: [true, 'Expiry date is required'],
      index: true,
    },
    renewalDate: {
      type: Date,
    },
    cost: {
      type: Number,
      default: 0,
    },
    currency: {
      type: String,
      default: 'INR',
    },
    department: {
      type: String,
      enum: ['Engineering', 'Marketing', 'Legal', 'HR', 'Finance', 'Operations', 'General'],
      default: 'General',
      index: true,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    isArchived: {
      type: Boolean,
      default: false,
      index: true,
    },
    status: {
      type: String,
      enum: ['Active', 'Expired', 'Expiring Soon', 'Renewed', 'Cancelled', 'Pending Approval'],
      default: 'Active',
      index: true,
    },
    renewalRequest: {
      status: {
        type: String,
        enum: ['None', 'Pending Approval', 'Approved', 'Rejected'],
        default: 'None',
        index: true,
      },
      newExpiryDate: { type: Date },
      cost: { type: Number, default: 0 },
      justification: { type: String, default: '' },
      quoteUrl: { type: String, default: '' },
      requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      requestedAt: { type: Date },
      reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      reviewedAt: { type: Date },
      rejectionReason: { type: String, default: '' },
    },
    reminderDays: {
      type: Number,
      default: 30, // Remind 30 days before expiry
    },
    reminderSent: {
      type: Boolean,
      default: false,
    },
    tags: [{ type: String, trim: true }],
    attachmentUrl: {
      type: String,
      default: '',
    },
    fileName: {
      type: String,
      default: '',
    },
    fileSize: {
      type: Number,
      default: 0,
    },
    fileType: {
      type: String,
      default: '',
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [1000, 'Notes cannot exceed 1000 characters'],
    },
  },
  { timestamps: true }
);

// Compound indexes for optimal query and aggregate performance
documentSchema.index({ user: 1, status: 1 });
documentSchema.index({ department: 1, status: 1 });
documentSchema.index({ user: 1, expiryDate: 1 });
documentSchema.index({ user: 1, createdAt: -1 });
documentSchema.index({ expiryDate: 1, status: 1 });

// Auto-update status before saving (preserve manually set terminal/custom statuses like 'Cancelled')
documentSchema.pre('save', function () {
  // If document is cancelled or pending renewal approval, do not override status
  if (this.status === 'Cancelled' || this.status === 'Pending Approval') {
    return;
  }

  const now = new Date();
  const expiry = new Date(this.expiryDate);
  const daysLeft = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));

  if (expiry < now) {
    this.status = 'Expired';
  } else if (daysLeft <= this.reminderDays) {
    this.status = 'Expiring Soon';
  } else {
    // If it was marked 'Renewed' and expiry is still in future, allow Active or preserve Renewed
    if (this.status !== 'Renewed') {
      this.status = 'Active';
    }
  }
});

// Virtual: days until expiry
documentSchema.virtual('daysUntilExpiry').get(function () {
  const now = new Date();
  return Math.ceil((new Date(this.expiryDate) - now) / (1000 * 60 * 60 * 24));
});

documentSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Document', documentSchema);
