const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const User = require('../models/User');
const {
  sendVerificationEmail,
} = require('../utils/email');

const router = express.Router();

// =====================================================
// TOKEN
// =====================================================

function createToken(user) {
  if (!process.env.JWT_SECRET) {
    throw new Error(
      'JWT_SECRET is missing from backend/.env'
    );
  }

  return jwt.sign(
    {
      userId: user._id.toString(),
      role: user.role,
      email: user.email,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: '7d',
    }
  );
}

// =====================================================
// AUTHENTICATION
// =====================================================

function authenticate(req, res, next) {
  try {
    const authHeader =
      req.headers.authorization || '';

    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
      });
    }

    const token =
      authHeader.split(' ')[1];

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    const userId =
      decoded.id ||
      decoded.userId ||
      decoded._id ||
      decoded.sub;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message:
          'Invalid authentication token.',
      });
    }

    req.user = {
      id: String(userId),
      role: decoded.role,
      email: decoded.email,
    };

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message:
        'Invalid or expired token.',
    });
  }
}

// =====================================================
// OTP GENERATOR
// =====================================================

function generateVerificationCode() {
  return String(
    Math.floor(
      100000 + Math.random() * 900000
    )
  );
}

// =====================================================
// SEND VERIFICATION CODE
// =====================================================

async function sendNewVerificationCode(user) {
  const code =
    generateVerificationCode();

  user.verificationCode = code;

  user.verificationCodeExpires =
    new Date(Date.now() + 10 * 60 * 1000);

  await user.save();

  await sendVerificationEmail({
    email: user.email,
    name: user.name,
    code,
  });

  return code;
}

// =====================================================
// SIGN UP
// POST /api/auth/signup
// =====================================================

router.post(
  '/signup',
  async (req, res) => {
    try {
      const {
        name,
        email,
        password,
        role,
        phone,
        country,
        countryCode,
        language,
        currency,
        timeZone,
      } = req.body;

      // -----------------------------
      // VALIDATION
      // -----------------------------

      if (
        !name ||
        !email ||
        !password
      ) {
        return res.status(400).json({
          success: false,
          message:
            'Name, email and password are required.',
        });
      }

      if (name.trim().length < 2) {
        return res.status(400).json({
          success: false,
          message:
            'Name must contain at least 2 characters.',
        });
      }

      if (password.length < 8) {
        return res.status(400).json({
          success: false,
          message:
            'Password must be at least 8 characters.',
        });
      }

      const normalizedEmail =
        email.trim().toLowerCase();

      const finalRole =
        role === 'companion'
          ? 'companion'
          : 'customer';

      // -----------------------------
      // EXISTING USER
      // -----------------------------

      const existingUser =
        await User.findOne({
          email: normalizedEmail,
        });

      if (existingUser) {
        return res.status(400).json({
          success: false,
          message:
            'An account with this email already exists.',
        });
      }

      // -----------------------------
      // HASH PASSWORD
      // -----------------------------

      const hashedPassword =
        await bcrypt.hash(
          password,
          10
        );

      // -----------------------------
      // CREATE USER
      // -----------------------------

      const user =
        await User.create({
          name: name.trim(),

          email: normalizedEmail,

          password: hashedPassword,

          phone: phone
            ? String(phone).trim()
            : '',

          country: country
            ? String(country).trim()
            : '',

          countryCode: countryCode
            ? String(countryCode).trim()
            : '',

          language:
            language || 'en',

          currency:
            currency || 'USD',

          timeZone:
            timeZone || 'UTC',

          role: finalRole,

          emailVerified: false,

          isVerified: false,

          isActive: true,
        });

      // -----------------------------
      // SEND EMAIL OTP
      // -----------------------------

      try {
        await sendNewVerificationCode(
          user
        );
      } catch (emailError) {
        console.error(
          'VERIFICATION EMAIL ERROR:',
          emailError
        );

        await User.findByIdAndDelete(
          user._id
        );

        return res.status(500).json({
          success: false,
          message:
            'Account could not be created because the verification email could not be sent. Please check email configuration.',
        });
      }

      // -----------------------------
      // RESPONSE
      // -----------------------------

      return res.status(201).json({
        success: true,

        requiresEmailVerification: true,

        message:
          'Account created. A verification code has been sent to your email.',

        user: {
          _id: user._id,
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          phone: user.phone,
          country: user.country,
          countryCode: user.countryCode,
          language: user.language,
          currency: user.currency,
          timeZone: user.timeZone,
          role: user.role,
          emailVerified:
            user.emailVerified,
          isVerified:
            user.isVerified,
          isActive:
            user.isActive,
          profileImage:
            user.profileImage || '',
        },
      });
    } catch (error) {
      console.error(
        'SIGNUP ERROR:',
        error
      );

      if (error.code === 11000) {
        return res.status(400).json({
          success: false,
          message:
            'An account with this email already exists.',
        });
      }

      return res.status(500).json({
        success: false,
        message:
          'Registration failed.',
      });
    }
  }
);

// =====================================================
// VERIFY EMAIL
// POST /api/auth/verify-email
// =====================================================

router.post(
  '/verify-email',
  async (req, res) => {
    try {
      const {
        email,
        code,
      } = req.body;

      if (!email || !code) {
        return res.status(400).json({
          success: false,
          message:
            'Email and verification code are required.',
        });
      }

      const normalizedEmail =
        email.trim().toLowerCase();

      const user =
        await User.findOne({
          email: normalizedEmail,
        }).select(
          '+verificationCode +verificationCodeExpires'
        );

      if (!user) {
        return res.status(404).json({
          success: false,
          message:
            'User account not found.',
        });
      }

      if (user.emailVerified) {
        return res.status(400).json({
          success: false,
          message:
            'Email is already verified.',
        });
      }

      if (
        !user.verificationCode ||
        !user.verificationCodeExpires
      ) {
        return res.status(400).json({
          success: false,
          message:
            'No active verification code. Please request a new code.',
        });
      }

      if (
        new Date() >
        user.verificationCodeExpires
      ) {
        return res.status(400).json({
          success: false,
          message:
            'Verification code has expired. Please request a new code.',
        });
      }

      if (
        String(code).trim() !==
        String(user.verificationCode).trim()
      ) {
        return res.status(400).json({
          success: false,
          message:
            'Incorrect verification code.',
        });
      }

      user.emailVerified = true;

      user.verificationCode = '';

      user.verificationCodeExpires =
        null;

      await user.save();

      const token =
        createToken(user);

      return res.status(200).json({
        success: true,

        message:
          'Email verified successfully.',

        token,

        user: {
          _id: user._id,
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          phone: user.phone,
          country: user.country,
          countryCode:
            user.countryCode,
          language: user.language,
          currency: user.currency,
          timeZone: user.timeZone,
          role: user.role,
          emailVerified:
            user.emailVerified,
          isVerified:
            user.isVerified,
          isActive:
            user.isActive,
          profileImage:
            user.profileImage || '',
        },
      });
    } catch (error) {
      console.error(
        'VERIFY EMAIL ERROR:',
        error
      );

      return res.status(500).json({
        success: false,
        message:
          'Unable to verify email.',
      });
    }
  }
);

// =====================================================
// RESEND VERIFICATION CODE
// POST /api/auth/resend-verification
// =====================================================

router.post(
  '/resend-verification',
  async (req, res) => {
    try {
      const { email } =
        req.body;

      if (!email) {
        return res.status(400).json({
          success: false,
          message:
            'Email address is required.',
        });
      }

      const normalizedEmail =
        email.trim().toLowerCase();

      const user =
        await User.findOne({
          email: normalizedEmail,
        });

      if (!user) {
        return res.status(404).json({
          success: false,
          message:
            'User account not found.',
        });
      }

      if (user.emailVerified) {
        return res.status(400).json({
          success: false,
          message:
            'Email is already verified.',
        });
      }

      await sendNewVerificationCode(
        user
      );

      return res.status(200).json({
        success: true,
        message:
          'A new verification code has been sent to your email.',
      });
    } catch (error) {
      console.error(
        'RESEND VERIFICATION ERROR:',
        error
      );

      return res.status(500).json({
        success: false,
        message:
          'Unable to send verification code.',
      });
    }
  }
);

// =====================================================
// SIGN IN
// POST /api/auth/signin
// =====================================================

router.post(
  '/signin',
  async (req, res) => {
    try {
      const {
        email,
        password,
      } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          success: false,
          message:
            'Email and password are required.',
        });
      }

      const normalizedEmail =
        email.trim().toLowerCase();

      const user =
        await User.findOne({
          email: normalizedEmail,
        }).select('+password');

      if (!user) {
        return res.status(401).json({
          success: false,
          message:
            'Invalid email or password.',
        });
      }

      if (
        user.isActive === false
      ) {
        return res.status(403).json({
          success: false,
          message:
            'Your account has been deactivated.',
        });
      }

      const passwordMatch =
        await bcrypt.compare(
          password,
          user.password
        );

      if (!passwordMatch) {
        return res.status(401).json({
          success: false,
          message:
            'Invalid email or password.',
        });
      }

      // -----------------------------
      // EMAIL VERIFICATION CHECK
      // -----------------------------

      if (!user.emailVerified) {
        try {
          await sendNewVerificationCode(
            user
          );
        } catch (emailError) {
          console.error(
            'LOGIN VERIFICATION EMAIL ERROR:',
            emailError
          );

          return res.status(500).json({
            success: false,
            message:
              'Email is not verified and the verification code could not be sent.',
          });
        }

        return res.status(403).json({
          success: false,

          requiresEmailVerification: true,

          message:
            'Please verify your email first. A new verification code has been sent to your email.',
        });
      }

      const token =
        createToken(user);

      return res.status(200).json({
        success: true,

        message:
          'Login successful.',

        token,

        user: {
          _id: user._id,
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          phone: user.phone,
          country: user.country,
          countryCode:
            user.countryCode,
          language: user.language,
          currency: user.currency,
          timeZone: user.timeZone,
          role: user.role,
          emailVerified:
            user.emailVerified,
          isVerified:
            user.isVerified,
          isActive:
            user.isActive,
          profileImage:
            user.profileImage || '',
        },
      });
    } catch (error) {
      console.error(
        'SIGNIN ERROR:',
        error
      );

      return res.status(500).json({
        success: false,
        message:
          'Login failed.',
      });
    }
  }
);

// =====================================================
// CURRENT USER
// GET /api/auth/me
// =====================================================

router.get(
  '/me',
  authenticate,
  async (req, res) => {
    try {
      const user =
        await User.findById(
          req.user.id
        ).select('-password');

      if (!user) {
        return res.status(404).json({
          success: false,
          message:
            'User not found.',
        });
      }

      return res.status(200).json({
        success: true,
        user,
      });
    } catch (error) {
      console.error(
        'GET ME ERROR:',
        error
      );

      return res.status(500).json({
        success: false,
        message:
          'Unable to load user profile.',
      });
    }
  }
);

module.exports = router;