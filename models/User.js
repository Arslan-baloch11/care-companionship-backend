const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    // =====================================================
    // BASIC USER INFO
    // =====================================================

    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 150,
    },

    password: {
      type: String,
      required: true,
      minlength: 8,
      select: false,
    },

    phone: {
      type: String,
      trim: true,
      default: '',
    },

    role: {
      type: String,
      enum: ['customer', 'companion', 'admin'],
      default: 'customer',
      required: true,
    },

    country: {
      type: String,
      trim: true,
      default: '',
    },

    countryCode: {
      type: String,
      trim: true,
      default: '',
    },

    language: {
      type: String,
      trim: true,
      default: 'en',
    },

    currency: {
      type: String,
      trim: true,
      default: 'USD',
    },

    timeZone: {
      type: String,
      trim: true,
      default: 'UTC',
    },

    profileImage: {
      type: String,
      default: '',
      trim: true,
    },

    bio: {
      type: String,
      default: '',
      trim: true,
      maxlength: 1000,
    },

    // =====================================================
    // EMAIL VERIFICATION
    // =====================================================

    emailVerified: {
      type: Boolean,
      default: false,
    },

    verificationCode: {
      type: String,
      default: '',
      select: false,
    },

    verificationCodeExpires: {
      type: Date,
      default: null,
      select: false,
    },

    // =====================================================
    // ACCOUNT VERIFICATION / ADMIN APPROVAL
    // =====================================================

    isVerified: {
      type: Boolean,
      default: false,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    // =====================================================
    // COMPANION PROFILE
    // =====================================================

    companionProfile: {
      profession: {
        type: String,
        default: '',
        trim: true,
      },

      experienceYears: {
        type: Number,
        default: 0,
        min: 0,
      },

      hourlyRate: {
        type: Number,
        default: 0,
        min: 0,
      },

      services: [
        {
          type: String,
          trim: true,
        },
      ],

      isAvailable: {
        type: Boolean,
        default: false,
      },
    },
  },
  {
    timestamps: true,
  }
);

// =====================================================
// HIDE PASSWORD FROM JSON
// =====================================================

userSchema.set('toJSON', {
  transform: function (doc, ret) {
    delete ret.password;
    delete ret.verificationCode;
    delete ret.verificationCodeExpires;

    return ret;
  },
});

module.exports = mongoose.model(
  'User',
  userSchema
);