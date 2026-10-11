const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const router = express.Router();

function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';

    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication token is required.',
      });
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication token is missing.',
      });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    req.user = decoded;

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired authentication token.',
    });
  }
}

function cleanString(value, maxLength = 500) {
  if (value === undefined || value === null) {
    return undefined;
  }

  return String(value).trim().slice(0, maxLength);
}

function formatUser(user) {
  const data = user.toObject
    ? user.toObject()
    : { ...user };

  delete data.password;

  return data;
}

// =====================================================
// GET MY PROFILE
// GET /api/profile/me
// =====================================================

router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User profile not found.',
      });
    }

    return res.status(200).json({
      success: true,
      user: formatUser(user),
    });
  } catch (error) {
    console.error('GET PROFILE ERROR:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to load profile.',
    });
  }
});

// =====================================================
// UPDATE MY PROFILE
// PUT /api/profile/me
// =====================================================

router.put('/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User profile not found.',
      });
    }

    const {
      name,
      phone,
      country,
      countryCode,
      language,
      currency,
      timeZone,
      profileImage,
      bio,
      profession,
      experienceYears,
      hourlyRate,
      services,
    } = req.body;

    // -----------------------------
    // COMMON PROFILE FIELDS
    // -----------------------------

    if (name !== undefined) {
      const cleanName = cleanString(name, 100);

      if (!cleanName || cleanName.length < 2) {
        return res.status(400).json({
          success: false,
          message: 'Name must contain at least 2 characters.',
        });
      }

      user.name = cleanName;
    }

    if (phone !== undefined) {
      user.phone = cleanString(phone, 30) || '';
    }

    if (country !== undefined) {
      user.country = cleanString(country, 80) || '';
    }

    if (countryCode !== undefined) {
      user.countryCode =
        cleanString(countryCode, 10) || '';
    }

    if (language !== undefined) {
      user.language =
        cleanString(language, 20) || 'en';
    }

    if (currency !== undefined) {
      user.currency =
        cleanString(currency, 10) || 'USD';
    }

    if (timeZone !== undefined) {
      user.timeZone =
        cleanString(timeZone, 80) || 'UTC';
    }

    if (profileImage !== undefined) {
      user.profileImage =
        cleanString(profileImage, 1000) || '';
    }

    if (bio !== undefined) {
      user.bio =
        cleanString(bio, 1000) || '';
    }

    // -----------------------------
    // COMPANION PROFILE
    // -----------------------------

    if (user.role === 'companion') {
      if (!user.companionProfile) {
        user.companionProfile = {};
      }

      if (profession !== undefined) {
        user.companionProfile.profession =
          cleanString(profession, 100) || '';
      }

      if (experienceYears !== undefined) {
        const experience =
          Number(experienceYears);

        if (
          !Number.isFinite(experience) ||
          experience < 0 ||
          experience > 80
        ) {
          return res.status(400).json({
            success: false,
            message:
              'Experience years must be between 0 and 80.',
          });
        }

        user.companionProfile.experienceYears =
          experience;
      }

      if (hourlyRate !== undefined) {
        const rate = Number(hourlyRate);

        if (
          !Number.isFinite(rate) ||
          rate < 0 ||
          rate > 100000
        ) {
          return res.status(400).json({
            success: false,
            message:
              'Hourly rate must be between 0 and 100000.',
          });
        }

        user.companionProfile.hourlyRate =
          rate;
      }

      if (services !== undefined) {
        if (!Array.isArray(services)) {
          return res.status(400).json({
            success: false,
            message: 'Services must be an array.',
          });
        }

        const cleanedServices = services
          .map((service) =>
            String(service || '').trim()
          )
          .filter(Boolean)
          .slice(0, 20);

        user.companionProfile.services =
          cleanedServices;
      }
    }

    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully.',
      user: formatUser(user),
    });
  } catch (error) {
    console.error('UPDATE PROFILE ERROR:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to update profile.',
    });
  }
});

// =====================================================
// CHANGE PASSWORD
// PUT /api/profile/change-password
// =====================================================

router.put(
  '/change-password',
  authenticateToken,
  async (req, res) => {
    try {
      const { currentPassword, newPassword } =
        req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({
          success: false,
          message:
            'Current password and new password are required.',
        });
      }

      if (String(newPassword).length < 8) {
        return res.status(400).json({
          success: false,
          message:
            'New password must be at least 8 characters.',
        });
      }

      const user = await User.findById(
        req.user.id
      ).select('+password');

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found.',
        });
      }

      const isMatch = await bcrypt.compare(
        currentPassword,
        user.password
      );

      if (!isMatch) {
        return res.status(400).json({
          success: false,
          message: 'Current password is incorrect.',
        });
      }

      const isSamePassword =
        await bcrypt.compare(
          newPassword,
          user.password
        );

      if (isSamePassword) {
        return res.status(400).json({
          success: false,
          message:
            'New password must be different from the current password.',
        });
      }

      user.password = await bcrypt.hash(
        newPassword,
        12
      );

      await user.save();

      return res.status(200).json({
        success: true,
        message:
          'Password changed successfully.',
      });
    } catch (error) {
      console.error(
        'CHANGE PASSWORD ERROR:',
        error
      );

      return res.status(500).json({
        success: false,
        message:
          'Failed to change password.',
      });
    }
  }
);

module.exports = router;