const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');
const Review = require('../models/Review');

const router = express.Router();

// =====================================================
// DEFAULT PROFILE SETTINGS
// =====================================================

const SOPHIA_DEFAULTS = {
  profession: 'Professional Care Companion',
  experienceYears: 5,
  hourlyRate: 22,
  services: ['Companionship', 'Senior Care'],
  isAvailable: true,
  bio:
    'Experienced and caring professional companion providing companionship, social support, and assistance with daily activities.',
};

// Adeel's default rate is only used when his stored rate
// is missing, invalid, or zero.
const ADEEL_EMAIL = 'faisalkhan7109024@gmail.com';
const ADEEL_DEFAULT_HOURLY_RATE = 20;

// =====================================================
// HELPER FUNCTIONS
// =====================================================

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isPositiveNumber(value) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return false;
  }

  const number = Number(value);

  return Number.isFinite(number) && number > 0;
}

// =====================================================
// NORMALIZE COMPANION DATA
// =====================================================

async function normalizeCompanion(companion) {
  if (!companion) {
    return companion;
  }

  const profile = companion.companionProfile || {};
  const updates = {};

  const email = String(companion.email || '')
    .trim()
    .toLowerCase();

  const name = String(companion.name || '')
    .trim()
    .toLowerCase();

  const isSophia =
    email === 'sophia@homecare.com' ||
    name === 'sophia williams';

  const isAdeel =
    email === ADEEL_EMAIL ||
    name === 'adeel';

  // ---------------------------------------------------
  // SOPHIA DEFAULTS
  // ---------------------------------------------------

  if (isSophia) {
    if (
      !profile.profession ||
      !String(profile.profession).trim()
    ) {
      updates['companionProfile.profession'] =
        SOPHIA_DEFAULTS.profession;
    }

    if (!isPositiveNumber(profile.experienceYears)) {
      updates['companionProfile.experienceYears'] =
        SOPHIA_DEFAULTS.experienceYears;
    }

    if (!isPositiveNumber(profile.hourlyRate)) {
      updates['companionProfile.hourlyRate'] =
        SOPHIA_DEFAULTS.hourlyRate;
    }

    if (
      !Array.isArray(profile.services) ||
      profile.services.length === 0
    ) {
      updates['companionProfile.services'] =
        SOPHIA_DEFAULTS.services;
    }

    if (profile.isAvailable !== true) {
      updates['companionProfile.isAvailable'] =
        SOPHIA_DEFAULTS.isAvailable;
    }

    if (!String(companion.bio || '').trim()) {
      updates.bio = SOPHIA_DEFAULTS.bio;
    }

    if (!companion.country) {
      updates.country = 'United States';
    }

    if (!companion.countryCode) {
      updates.countryCode = 'US';
    }

    if (!companion.language) {
      updates.language = 'en';
    }

    if (!companion.currency) {
      updates.currency = 'USD';
    }

    if (!companion.timeZone) {
      updates.timeZone = 'America/New_York';
    }
  }

  // ---------------------------------------------------
  // ADEEL RATE FIX
  // ---------------------------------------------------

  if (
    isAdeel &&
    !isPositiveNumber(profile.hourlyRate)
  ) {
    updates['companionProfile.hourlyRate'] =
      ADEEL_DEFAULT_HOURLY_RATE;
  }

  // ---------------------------------------------------
  // SAVE CHANGES TO DATABASE
  // ---------------------------------------------------

  if (Object.keys(updates).length > 0) {
    await User.updateOne(
      { _id: companion._id },
      { $set: updates }
    );

    // Also update the current in-memory object.
    for (const [path, value] of Object.entries(updates)) {
      const parts = path.split('.');

      if (parts.length === 2) {
        const parent = parts[0];
        const child = parts[1];

        if (!companion[parent]) {
          companion[parent] = {};
        }

        companion[parent][child] = value;
      } else {
        companion[path] = value;
      }
    }
  }

  return companion;
}

// =====================================================
// REVIEW STATISTICS
// =====================================================

async function getReviewStats(companionId) {
  try {
    if (
      !mongoose.Types.ObjectId.isValid(
        String(companionId)
      )
    ) {
      return {
        averageRating: 0,
        reviewCount: 0,
      };
    }

    const stats = await Review.aggregate([
      {
        $match: {
          companion: new mongoose.Types.ObjectId(
            String(companionId)
          ),
          isPublished: true,
        },
      },
      {
        $group: {
          _id: null,
          averageRating: {
            $avg: '$rating',
          },
          reviewCount: {
            $sum: 1,
          },
        },
      },
    ]);

    if (!stats.length) {
      return {
        averageRating: 0,
        reviewCount: 0,
      };
    }

    return {
      averageRating: Number(
        stats[0].averageRating || 0
      ).toFixed(1),

      reviewCount: Number(
        stats[0].reviewCount || 0
      ),
    };
  } catch (error) {
    console.error(
      'REVIEW STATS ERROR:',
      error.message
    );

    return {
      averageRating: 0,
      reviewCount: 0,
    };
  }
}

// =====================================================
// FORMAT COMPANION RESPONSE
// =====================================================

async function formatCompanion(companion) {
  const normalized = await normalizeCompanion(companion);

  const stats = await getReviewStats(normalized._id);

  const profile =
    normalized.companionProfile || {};

  const hourlyRate = Number(profile.hourlyRate) || 0;

  const profession =
    profile.profession ||
    'Professional Care Companion';

  const experienceYears =
    Number(profile.experienceYears) || 0;

  const services = Array.isArray(profile.services)
    ? profile.services
    : [];

  const isAvailable =
    profile.isAvailable === true;

  // Include both old and new response formats.
  // This lets existing screens and booking.tsx read the rate.
  const companionProfile = {
    ...profile,
    profession,
    experienceYears,
    hourlyRate,
    services,
    isAvailable,
  };

  return {
    _id: normalized._id,
    name: normalized.name,
    email: normalized.email,

    country:
      normalized.country || 'Not specified',

    countryCode:
      normalized.countryCode || '',

    language:
      normalized.language || 'en',

    currency:
      normalized.currency || 'USD',

    timeZone:
      normalized.timeZone || 'UTC',

    profileImage:
      normalized.profileImage || '',

    bio:
      normalized.bio || '',

    verified:
      normalized.isVerified === true,

    // Root-level fields for older screens
    profession,
    experienceYears,
    hourlyRate,
    services,
    isAvailable,

    // Nested fields for booking.tsx
    companionProfile,

    rating: Number(stats.averageRating || 0),
    reviewCount: Number(stats.reviewCount || 0),
  };
}

// =====================================================
// GET ALL COMPANIONS
//
// GET /api/companions
//
// Supported query parameters:
// ?search=adeel
// ?service=Companionship
// ?country=United States
// ?available=true
// ?minRate=10
// ?maxRate=50
// ?sort=price_low
// ?sort=price_high
// ?sort=experience
// ?sort=rating
// =====================================================

router.get('/', async (req, res) => {
  try {
    const {
      search = '',
      service = '',
      country = '',
      available = '',
      minRate = '',
      maxRate = '',
      sort = '',
    } = req.query;

    const filter = {
      role: 'companion',
      isActive: true,
    };

    // SEARCH
    if (String(search).trim()) {
      const searchRegex = new RegExp(
        escapeRegex(String(search).trim()),
        'i'
      );

      filter.$or = [
        { name: searchRegex },
        { email: searchRegex },
        { country: searchRegex },
        { bio: searchRegex },
        {
          'companionProfile.profession':
            searchRegex,
        },
        {
          'companionProfile.services':
            searchRegex,
        },
      ];
    }

    // SERVICE FILTER
    if (String(service).trim()) {
      filter['companionProfile.services'] = {
        $in: [String(service).trim()],
      };
    }

    // COUNTRY FILTER
    if (String(country).trim()) {
      filter.country = {
        $regex:
          `^${escapeRegex(String(country).trim())}$`,
        $options: 'i',
      };
    }

    // AVAILABILITY FILTER
    if (available === 'true') {
      filter['companionProfile.isAvailable'] = true;
    } else if (available === 'false') {
      filter['companionProfile.isAvailable'] = false;
    }

    // HOURLY RATE FILTER
    const rateFilter = {};

    if (
      minRate !== '' &&
      Number.isFinite(Number(minRate)) &&
      Number(minRate) >= 0
    ) {
      rateFilter.$gte = Number(minRate);
    }

    if (
      maxRate !== '' &&
      Number.isFinite(Number(maxRate)) &&
      Number(maxRate) >= 0
    ) {
      rateFilter.$lte = Number(maxRate);
    }

    if (Object.keys(rateFilter).length > 0) {
      filter['companionProfile.hourlyRate'] =
        rateFilter;
    }

    // DATABASE QUERY
    const companions = await User.find(filter)
      .select(
        [
          'name',
          'email',
          'country',
          'countryCode',
          'language',
          'currency',
          'timeZone',
          'profileImage',
          'bio',
          'isVerified',
          'companionProfile',
          'createdAt',
        ].join(' ')
      )
      .sort({ createdAt: -1 })
      .lean();

    // FORMAT RESULTS
    const result = [];

    for (const companion of companions) {
      result.push(
        await formatCompanion(companion)
      );
    }

    // SORT RESULTS
    if (sort === 'price_low') {
      result.sort(
        (a, b) => a.hourlyRate - b.hourlyRate
      );
    }

    if (sort === 'price_high') {
      result.sort(
        (a, b) => b.hourlyRate - a.hourlyRate
      );
    }

    if (sort === 'experience') {
      result.sort(
        (a, b) => b.experienceYears - a.experienceYears
      );
    }

    if (sort === 'rating') {
      result.sort(
        (a, b) => b.rating - a.rating
      );
    }

    return res.status(200).json({
      success: true,
      count: result.length,
      companions: result,
    });
  } catch (error) {
    console.error(
      'COMPANION SEARCH ERROR:',
      error
    );

    return res.status(500).json({
      success: false,
      message: 'Unable to load companions.',
    });
  }
});

// =====================================================
// GET SINGLE COMPANION
//
// GET /api/companions/:id
// =====================================================

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid companion ID.',
      });
    }

    const companion = await User.findOne({
      _id: id,
      role: 'companion',
      isActive: true,
    })
      .select(
        [
          'name',
          'email',
          'country',
          'countryCode',
          'language',
          'currency',
          'timeZone',
          'profileImage',
          'bio',
          'isVerified',
          'companionProfile',
          'createdAt',
        ].join(' ')
      )
      .lean();

    if (!companion) {
      return res.status(404).json({
        success: false,
        message: 'Companion not found.',
      });
    }

    const result = await formatCompanion(companion);

    return res.status(200).json({
      success: true,
      companion: result,
    });
  } catch (error) {
    console.error(
      'SINGLE COMPANION ERROR:',
      error
    );

    return res.status(500).json({
      success: false,
      message: 'Unable to load companion profile.',
    });
  }
});

// =====================================================
// EXPORT ROUTER
// =====================================================

module.exports = router;