const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema(
  {
    // Customer who requested the booking
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // Companion who will provide the service
    companion: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    companionName: {
      type: String,
      trim: true,
      default: '',
    },

    // Requested care service
    service: {
      type: String,
      required: [true, 'Service is required.'],
      trim: true,
    },

    // Booking date in YYYY-MM-DD format
    date: {
      type: String,
      required: [true, 'Booking date is required.'],
      trim: true,
      match: [
        /^\d{4}-\d{2}-\d{2}$/,
        'Date must use YYYY-MM-DD format.',
      ],
    },

    // Booking start time in HH:mm format
    time: {
      type: String,
      required: [true, 'Booking time is required.'],
      trim: true,
      match: [
        /^([01]\d|2[0-3]):[0-5]\d$/,
        'Time must use HH:mm format.',
      ],
    },

    // Number of care hours
    hours: {
      type: Number,
      required: [true, 'Booking hours are required.'],
      min: [1, 'Booking must be at least 1 hour.'],
      max: [24, 'Booking cannot exceed 24 hours.'],
      validate: {
        validator(value) {
          return Number.isFinite(value) && Number.isInteger(value);
        },
        message: 'Booking hours must be a whole number.',
      },
    },

    // Companion's actual hourly rate
    hourlyRate: {
      type: Number,
      required: [true, 'Hourly rate is required.'],
      min: [0, 'Hourly rate cannot be negative.'],
      validate: {
        validator(value) {
          return Number.isFinite(value);
        },
        message: 'Hourly rate must be a valid number.',
      },
    },

    // Calculated automatically before saving
    totalAmount: {
      type: Number,
      required: true,
      min: [0, 'Total amount cannot be negative.'],
      default: 0,
    },

    notes: {
      type: String,
      trim: true,
      maxlength: [2000, 'Notes cannot exceed 2000 characters.'],
      default: '',
    },

    // Booking lifecycle
    status: {
      type: String,
      enum: [
        'pending',
        'confirmed',
        'rejected',
        'completed',
        'cancelled',
      ],
      default: 'pending',
      index: true,
    },

    // Payment information
    paymentMethod: {
      type: String,
      trim: true,
      default: 'card',
    },

    paymentStatus: {
      type: String,
      enum: [
        'pending',
        'paid',
        'failed',
        'refunded',
        'unpaid',
      ],
      default: 'pending',
    },

    transactionId: {
      type: String,
      trim: true,
      default: '',
    },

    // Optional lifecycle timestamps
    confirmedAt: {
      type: Date,
      default: null,
    },

    completedAt: {
      type: Date,
      default: null,
    },

    cancelledAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Calculate the total before saving.
// Do not call next() in this synchronous middleware.
bookingSchema.pre('save', function () {
  const hours = Number(this.hours);
  const rate = Number(this.hourlyRate);

  if (
    Number.isFinite(hours) &&
    hours > 0 &&
    Number.isFinite(rate) &&
    rate >= 0
  ) {
    this.totalAmount = Number((hours * rate).toFixed(2));
  }
});

// Useful query index for companion booking lists and date checks.
bookingSchema.index({
  companion: 1,
  date: 1,
  status: 1,
});

bookingSchema.index({
  customer: 1,
  createdAt: -1,
});

// Avoid recompiling the model during development reloads.
module.exports =
  mongoose.models.Booking ||
  mongoose.model('Booking', bookingSchema);