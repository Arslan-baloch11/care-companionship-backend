const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const User = require('../models/User');
const Availability = require('../models/Availability');

const router = express.Router();

// IMPORTANT: These values must remain lowercase.
// The Availability model expects lowercase weekday values.
const DAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

const DEFAULT_START = '09:00';
const DEFAULT_END = '17:00';

// =====================================================
// DEFAULT SCHEDULE
// =====================================================

function createDefaultSchedule() {
  return DAYS.map((day) => ({
    day,
    enabled: false,
    slots: [],
  }));
}

// =====================================================
// AUTHENTICATION
// =====================================================

function authenticate(req, res, next) {
  try {
    const authorization =
      req.headers.authorization || '';

    if (!authorization.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
      });
    }

    const token = authorization.slice(7).trim();

    if (!token || !process.env.JWT_SECRET) {
      return res.status(401).json({
        success: false,
        message: 'Invalid authentication token.',
      });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    const userId =
      decoded.id ||
      decoded.userId ||
      decoded._id ||
      decoded.sub ||
      null;

    const email = decoded.email
      ? String(decoded.email).trim().toLowerCase()
      : null;

    if (!userId && !email) {
      return res.status(401).json({
        success: false,
        message: 'Authentication identity is missing.',
      });
    }

    req.auth = {
      id: userId ? String(userId) : null,
      email,
    };

    next();
  } catch (error) {
    console.error(
      'AVAILABILITY AUTH ERROR:',
      error.message
    );

    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token. Please sign in again.',
    });
  }
}

// =====================================================
// FIND COMPANION FROM DATABASE
// =====================================================

async function requireCompanion(req, res, next) {
  try {
    let companion = null;

    if (
      req.auth.id &&
      mongoose.Types.ObjectId.isValid(req.auth.id)
    ) {
      companion = await User.findById(req.auth.id);
    }

    // Do not allow a customer account to manage availability.
    if (companion && companion.role !== 'companion') {
      return res.status(403).json({
        success: false,
        message: 'Only companion accounts can manage availability.',
      });
    }

    // Only fall back to email if no database user was found.
    if (!companion && req.auth.email) {
      companion = await User.findOne({
        email: req.auth.email,
        role: 'companion',
      });
    }

    if (!companion) {
      return res.status(404).json({
        success: false,
        message:
          'Companion account not found. Sign in again using your registered companion account.',
      });
    }

    if (companion.isActive === false) {
      return res.status(403).json({
        success: false,
        message: 'This companion account is inactive.',
      });
    }

    req.companion = companion;

    req.user = {
      id: String(companion._id),
      userId: String(companion._id),
      _id: String(companion._id),
      email: companion.email,
      role: companion.role,
    };

    next();
  } catch (error) {
    console.error(
      'RESOLVE COMPANION ERROR:',
      error
    );

    return res.status(500).json({
      success: false,
      message: 'Unable to identify the companion account.',
    });
  }
}

// =====================================================
// DAY NORMALIZATION
// Supports Monday, monday, MONDAY and short names.
// Always returns the lowercase database enum value.
// =====================================================

function normalizeDay(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  return (
    DAYS.find(
      (day) =>
        day === normalized ||
        day.startsWith(normalized)
    ) || null
  );
}

// =====================================================
// TIME HELPERS
// =====================================================

function isValidTime(value) {
  return (
    typeof value === 'string' &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
  );
}

function timeToMinutes(value) {
  if (!isValidTime(value)) {
    return null;
  }

  const [hours, minutes] = value.split(':').map(Number);

  return hours * 60 + minutes;
}

// =====================================================
// NORMALIZE SLOTS
// =====================================================

function normalizeSlots(day, dayInput) {
  let slots = Array.isArray(dayInput.slots)
    ? dayInput.slots
    : [];

  // Support older startTime/endTime field names.
  if (
    slots.length === 0 &&
    (
      dayInput.startTime ||
      dayInput.endTime ||
      dayInput.start ||
      dayInput.end
    )
  ) {
    slots = [
      {
        start:
          dayInput.start ||
          dayInput.startTime ||
          DEFAULT_START,
        end:
          dayInput.end ||
          dayInput.endTime ||
          DEFAULT_END,
      },
    ];
  }

  // An enabled day must have a valid time slot.
  if (dayInput.enabled === true && slots.length === 0) {
    slots = [
      {
        start: DEFAULT_START,
        end: DEFAULT_END,
      },
    ];
  }

  return slots.map((slot) => {
    const start = slot.start || slot.startTime;
    const end = slot.end || slot.endTime;

    if (!isValidTime(start) || !isValidTime(end)) {
      throw new Error(
        `${day}: enter times in 24-hour format, e.g. 09:00 and 17:00.`
      );
    }

    if (timeToMinutes(start) >= timeToMinutes(end)) {
      throw new Error(
        `${day}: end time must be later than start time.`
      );
    }

    return {
      start,
      end,
    };
  });
}

// =====================================================
// NORMALIZE WEEKLY SCHEDULE
// =====================================================

function normalizeWeeklySchedule(
  body,
  existingSchedule = []
) {
  const source =
    body?.availability &&
    typeof body.availability === 'object'
      ? body.availability
      : body || {};

  let rawSchedule =
    source.weeklySchedule ||
    source.schedule ||
    null;

  // Also accept an object keyed by day name.
  if (
    !rawSchedule &&
    DAYS.some((day) =>
      Object.keys(source).some(
        (key) => normalizeDay(key) === day
      )
    )
  ) {
    rawSchedule = source;
  }

  function getDayInput(day) {
    if (Array.isArray(rawSchedule)) {
      return (
        rawSchedule.find(
          (item) => normalizeDay(item?.day) === day
        ) || null
      );
    }

    if (
      rawSchedule &&
      typeof rawSchedule === 'object'
    ) {
      const matchingKey = Object.keys(rawSchedule).find(
        (key) => normalizeDay(key) === day
      );

      return matchingKey
        ? rawSchedule[matchingKey]
        : null;
    }

    return null;
  }

  return DAYS.map((day) => {
    const oldDay = Array.isArray(existingSchedule)
      ? existingSchedule.find(
          (item) => normalizeDay(item?.day) === day
        )
      : null;

    const input = getDayInput(day);

    const dayInput = input || oldDay || {};

    let enabled = false;

    if (typeof dayInput.enabled === 'boolean') {
      enabled = dayInput.enabled;
    } else if (typeof dayInput.available === 'boolean') {
      enabled = dayInput.available;
    } else if (
      typeof dayInput.isAvailable === 'boolean'
    ) {
      enabled = dayInput.isAvailable;
    }

    const slots = normalizeSlots(
      day,
      {
        ...dayInput,
        enabled,
      }
    );

    return {
      // This lowercase value fixes the MongoDB enum error.
      day,
      enabled,
      slots,
    };
  });
}

// =====================================================
// GET OR CREATE AVAILABILITY
// =====================================================

async function getOrCreateAvailability(companion) {
  let availability = await Availability.findOne({
    companion: companion._id,
  });

  if (!availability) {
    availability = await Availability.create({
      companion: companion._id,
      isAvailable:
        companion.companionProfile?.isAvailable === true,
      weeklySchedule: createDefaultSchedule(),
      blockedDates: [],
      timeZone: companion.timeZone || 'UTC',
      bufferMinutes: 0,
    });
  }

  return availability;
}

// =====================================================
// GET MY AVAILABILITY
// GET /api/availability/my
// =====================================================

async function getMyAvailability(req, res) {
  try {
    const availability = await getOrCreateAvailability(
      req.companion
    );

    return res.status(200).json({
      success: true,
      message: 'Availability loaded successfully.',
      availability,
      weeklySchedule: availability.weeklySchedule,
      isAvailable: availability.isAvailable,
      timeZone: availability.timeZone,
      bufferMinutes: availability.bufferMinutes,
      blockedDates: availability.blockedDates,
    });
  } catch (error) {
    console.error(
      'AVAILABILITY GET ERROR:',
      error
    );

    return res.status(500).json({
      success: false,
      message: 'Unable to load availability.',
    });
  }
}

// =====================================================
// SAVE MY AVAILABILITY
// =====================================================

async function saveMyAvailability(req, res) {
  try {
    const companion = req.companion;

    const current = await getOrCreateAvailability(
      companion
    );

    const body =
      req.body?.availability &&
      typeof req.body.availability === 'object'
        ? {
            ...req.body,
            ...req.body.availability,
          }
        : req.body || {};

    // Normalize weekday enum values before Mongoose validation.
    const weeklySchedule = normalizeWeeklySchedule(
      body,
      current.weeklySchedule
    );

    const update = {
      weeklySchedule,
    };

    if (typeof body.isAvailable === 'boolean') {
      update.isAvailable = body.isAvailable;
    }

    if (typeof body.timeZone === 'string') {
      update.timeZone = body.timeZone.trim() || 'UTC';
    }

    if (body.bufferMinutes !== undefined) {
      const bufferMinutes = Number(body.bufferMinutes);

      if (
        !Number.isInteger(bufferMinutes) ||
        bufferMinutes < 0 ||
        bufferMinutes > 1440
      ) {
        return res.status(400).json({
          success: false,
          message:
            'Buffer minutes must be a whole number between 0 and 1440.',
        });
      }

      update.bufferMinutes = bufferMinutes;
    }

    if (Array.isArray(body.blockedDates)) {
      update.blockedDates = body.blockedDates;
    }

    const saved = await Availability.findOneAndUpdate(
      {
        companion: companion._id,
      },
      {
        $set: update,
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    );

    // Keep the companion profile and schedule toggle consistent.
    if (typeof body.isAvailable === 'boolean') {
      if (!companion.companionProfile) {
        companion.companionProfile = {};
      }

      companion.companionProfile.isAvailable =
        body.isAvailable;

      await companion.save();
    }

    return res.status(200).json({
      success: true,
      message: 'Weekly availability saved successfully.',
      availability: saved,
      weeklySchedule: saved.weeklySchedule,
      isAvailable: saved.isAvailable,
      timeZone: saved.timeZone,
      bufferMinutes: saved.bufferMinutes,
      blockedDates: saved.blockedDates,
    });
  } catch (error) {
    console.error(
      'AVAILABILITY SAVE ERROR:',
      error
    );

    return res.status(400).json({
      success: false,
      message:
        error.message || 'Unable to save availability.',
    });
  }
}

// =====================================================
// ROUTES
// =====================================================

// GET availability
router.get(
  '/',
  authenticate,
  requireCompanion,
  getMyAvailability
);

router.get(
  '/my',
  authenticate,
  requireCompanion,
  getMyAvailability
);

router.get(
  '/me',
  authenticate,
  requireCompanion,
  getMyAvailability
);

// Save availability
router.put(
  '/',
  authenticate,
  requireCompanion,
  saveMyAvailability
);

router.put(
  '/my',
  authenticate,
  requireCompanion,
  saveMyAvailability
);

router.put(
  '/me',
  authenticate,
  requireCompanion,
  saveMyAvailability
);

router.put(
  '/update',
  authenticate,
  requireCompanion,
  saveMyAvailability
);

router.patch(
  '/my',
  authenticate,
  requireCompanion,
  saveMyAvailability
);

router.patch(
  '/update',
  authenticate,
  requireCompanion,
  saveMyAvailability
);

router.post(
  '/',
  authenticate,
  requireCompanion,
  saveMyAvailability
);

router.post(
  '/my',
  authenticate,
  requireCompanion,
  saveMyAvailability
);
// =====================================================
// PUBLIC COMPANION AVAILABILITY
// Used by the customer booking screen
// =====================================================

async function getPublicCompanionAvailability(req, res) {
  try {
    const { companionId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(companionId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid companion ID.',
      });
    }

    const companion = await User.findOne({
      _id: companionId,
      role: 'companion',
      isActive: { $ne: false },
    })
      .select('_id name email country companionProfile timeZone')
      .lean();

    if (!companion) {
      return res.status(404).json({
        success: false,
        message: 'Companion not found.',
      });
    }

    const availability = await Availability.findOne({
      companion: companion._id,
    }).lean();

    return res.status(200).json({
      success: true,
      companion: {
        _id: companion._id,
        name: companion.name,
        email: companion.email,
        country: companion.country,
        hourlyRate: companion.companionProfile?.hourlyRate || 0,
        services: companion.companionProfile?.services || [],
      },
      availability: availability || null,
      weeklySchedule: availability?.weeklySchedule || [],
      isAvailable:
        companion.companionProfile?.isAvailable === true &&
        availability?.isAvailable === true,
    });
  } catch (error) {
    console.error('PUBLIC COMPANION AVAILABILITY ERROR:', error);

    return res.status(500).json({
      success: false,
      message: 'Unable to load companion availability.',
    });
  }
}

// Keep the specific route before the generic ID route.
router.get(
  '/companion/:companionId',
  getPublicCompanionAvailability
);

router.get(
  '/:companionId',
  getPublicCompanionAvailability
);
module.exports = router;