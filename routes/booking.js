const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const Booking = require('../models/Booking');
const User = require('../models/User');
const Availability = require('../models/Availability');
const Notification = require('../models/Notification');

const router = express.Router();

// =====================================================
// AUTHENTICATION
// =====================================================

function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';

    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
      });
    }

    const token = authHeader.split(' ')[1];

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
        message: 'Invalid authentication token.',
      });
    }

    req.user = {
      id: String(userId),
      role: decoded.role,
      email: decoded.email,
    };

    next();
  } catch (error) {
    console.error('AUTH ERROR:', error.message);

    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token.',
    });
  }
}

// =====================================================
// ROLE CHECKS
// =====================================================

function requireCustomer(req, res, next) {
  if (req.user?.role !== 'customer') {
    return res.status(403).json({
      success: false,
      message: 'Only customers can perform this action.',
    });
  }

  next();
}

function requireCompanion(req, res, next) {
  if (req.user?.role !== 'companion') {
    return res.status(403).json({
      success: false,
      message: 'Only companions can perform this action.',
    });
  }

  next();
}

// =====================================================
// NOTIFICATION HELPER
// =====================================================

async function createNotification({
  recipient,
  type,
  title,
  message,
  booking = null,
}) {
  try {
    if (!recipient) {
      return null;
    }

    return await Notification.create({
      recipient,
      type,
      title,
      message,
      booking: booking || null,
    });
  } catch (error) {
    console.error(
      'NOTIFICATION CREATION ERROR:',
      error.message
    );

    return null;
  }
}

// =====================================================
// DATE HELPERS
// =====================================================

function parseBookingDate(value) {
  const input = String(value || '').trim();

  // DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(input)) {
    const [day, month, year] = input
      .split('/')
      .map(Number);

    const date = new Date(
      year,
      month - 1,
      day
    );

    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return date;
  }

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const [year, month, day] = input
      .split('-')
      .map(Number);

    const date = new Date(
      year,
      month - 1,
      day
    );

    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return date;
  }

  return null;
}

function dateToKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function getDayName(date) {
  const days = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
  ];

  return days[date.getDay()];
}

// =====================================================
// TIME HELPERS
// =====================================================

function parseTimeToMinutes(value) {
  const input = String(value || '').trim();

  // 24-hour HH:mm
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(input)) {
    const [hour, minute] = input
      .split(':')
      .map(Number);

    return hour * 60 + minute;
  }

  // 12-hour h:mm AM/PM
  const match = input.match(
    /^(\d{1,2}):([0-5]\d)\s*(AM|PM)$/i
  );

  if (!match) {
    return null;
  }

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const period = match[3].toUpperCase();

  if (hour < 1 || hour > 12) {
    return null;
  }

  if (period === 'AM') {
    if (hour === 12) {
      hour = 0;
    }
  } else if (hour !== 12) {
    hour += 12;
  }

  return hour * 60 + minute;
}

// =====================================================
// LOCATION HELPER
// =====================================================

function parseLocation(body) {
  const latitude = body?.latitude;
  const longitude = body?.longitude;

  const hasLatitude =
    latitude !== undefined &&
    latitude !== null &&
    latitude !== '';

  const hasLongitude =
    longitude !== undefined &&
    longitude !== null &&
    longitude !== '';

  if (!hasLatitude && !hasLongitude) {
    return null;
  }

  const lat = Number(latitude);
  const lng = Number(longitude);

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return 'INVALID';
  }

  return {
    latitude: lat,
    longitude: lng,
  };
}

// =====================================================
// AVAILABILITY VALIDATION
// =====================================================

async function validateAvailability({
  companionId,
  bookingDate,
  bookingTime,
  hours,
}) {
  const parsedDate = parseBookingDate(
    bookingDate
  );

  if (!parsedDate) {
    return {
      valid: false,
      message: 'Invalid booking date.',
    };
  }

  const numericHours = Number(hours);

  if (
    !Number.isFinite(numericHours) ||
    numericHours < 1 ||
    numericHours > 24
  ) {
    return {
      valid: false,
      message:
        'Booking duration must be between 1 and 24 hours.',
    };
  }

  const user = await User.findOne({
    _id: companionId,
    role: 'companion',
    isActive: true,
  }).lean();

  if (!user) {
    return {
      valid: false,
      message: 'Companion not found.',
    };
  }

  if (
    user.companionProfile?.isAvailable !== true
  ) {
    return {
      valid: false,
      message:
        'This companion is currently unavailable.',
    };
  }

  const availability =
    await Availability.findOne({
      companion: companionId,
    }).lean();

  if (!availability) {
    return {
      valid: false,
      message:
        'Companion availability is not configured.',
    };
  }

  if (availability.isAvailable !== true) {
    return {
      valid: false,
      message:
        'This companion is currently unavailable.',
    };
  }

  const dateKey = dateToKey(parsedDate);

  const blocked =
    Array.isArray(availability.blockedDates)
      ? availability.blockedDates.find(
          (item) => item.date === dateKey
        )
      : null;

  if (blocked) {
    return {
      valid: false,
      message: blocked.reason
        ? `Companion is unavailable on this date: ${blocked.reason}`
        : 'Companion is unavailable on this date.',
    };
  }

  const dayName = getDayName(parsedDate);

  const schedule =
    Array.isArray(availability.weeklySchedule)
      ? availability.weeklySchedule.find(
          (item) => item.day === dayName
        )
      : null;

  if (
    !schedule ||
    schedule.enabled !== true ||
    !Array.isArray(schedule.slots) ||
    schedule.slots.length === 0
  ) {
    return {
      valid: false,
      message:
        `Companion is not available on ${dayName}.`,
    };
  }

  const startMinutes = parseTimeToMinutes(
    bookingTime
  );

  if (startMinutes === null) {
    return {
      valid: false,
      message: 'Invalid booking time.',
    };
  }

  const endMinutes =
    startMinutes + numericHours * 60;

  const insideSchedule =
    schedule.slots.some((slot) => {
      const slotStart = parseTimeToMinutes(
        slot.start
      );

      const slotEnd = parseTimeToMinutes(
        slot.end
      );

      if (
        slotStart === null ||
        slotEnd === null
      ) {
        return false;
      }

      return (
        startMinutes >= slotStart &&
        endMinutes <= slotEnd
      );
    });

  if (!insideSchedule) {
    return {
      valid: false,
      message:
        'The selected date and time are outside the companion availability.',
    };
  }

  return {
    valid: true,
    date: dateKey,
    day: dayName,
    startMinutes,
    endMinutes,
    bufferMinutes: Number(
      availability.bufferMinutes || 0
    ),
  };
}

// =====================================================
// OVERLAPPING BOOKINGS CHECK
// =====================================================

async function checkBookingConflict({
  companionId,
  bookingDate,
  bookingTime,
  hours,
}) {
  const parsedDate = parseBookingDate(
    bookingDate
  );

  const startMinutes =
    parseTimeToMinutes(bookingTime);

  const numericHours = Number(hours);

  if (
    !parsedDate ||
    startMinutes === null ||
    !Number.isFinite(numericHours)
  ) {
    return {
      conflict: false,
    };
  }

  const newEnd =
    startMinutes + numericHours * 60;

  const bookings = await Booking.find({
    companion: companionId,
    date: bookingDate,
    status: {
      $in: ['pending', 'confirmed'],
    },
  }).lean();

  for (const booking of bookings) {
    const existingStart =
      parseTimeToMinutes(booking.time);

    const existingHours =
      Number(booking.hours);

    if (
      existingStart === null ||
      !Number.isFinite(existingHours)
    ) {
      continue;
    }

    const existingEnd =
      existingStart + existingHours * 60;

    const overlaps =
      startMinutes < existingEnd &&
      newEnd > existingStart;

    if (overlaps) {
      return {
        conflict: true,
        message:
          'This time overlaps with another booking.',
      };
    }
  }

  return {
    conflict: false,
  };
}

// =====================================================
// CREATE BOOKING
// POST /api/bookings
// =====================================================

router.post(
  '/',
  authenticateToken,
  requireCustomer,
  async (req, res) => {
    try {
      const {
        companionId,
        companionEmail,
        companionName,
        service,
        date,
        time,
        hours,
        hourlyRate,
        notes,
      } = req.body;

      if (
        !companionId ||
        !service ||
        !date ||
        !time ||
        !hours
      ) {
        return res.status(400).json({
          success: false,
          message:
            'Companion, service, date, time and hours are required.',
        });
      }

      if (
        !mongoose.Types.ObjectId.isValid(
          companionId
        )
      ) {
        return res.status(400).json({
          success: false,
          message: 'Invalid companion ID.',
        });
      }

      const companion =
        await User.findOne({
          _id: companionId,
          role: 'companion',
          isActive: true,
        });

      if (!companion) {
        return res.status(404).json({
          success: false,
          message: 'Companion not found.',
        });
      }

      const companionServices =
        Array.isArray(
          companion.companionProfile?.services
        )
          ? companion.companionProfile.services
          : [];

      if (
        companionServices.length > 0 &&
        !companionServices.some(
          (item) =>
            String(item)
              .trim()
              .toLowerCase() ===
            String(service)
              .trim()
              .toLowerCase()
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            'Selected service is not offered by this companion.',
        });
      }

      const actualHourlyRate =
        Number(
          companion.companionProfile?.hourlyRate
        );

      if (
        !Number.isFinite(actualHourlyRate) ||
        actualHourlyRate <= 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            'Companion hourly rate is not configured.',
        });
      }

      const availabilityResult =
        await validateAvailability({
          companionId,
          bookingDate: date,
          bookingTime: time,
          hours,
        });

      if (!availabilityResult.valid) {
        return res.status(400).json({
          success: false,
          message:
            availabilityResult.message,
        });
      }

      const conflict =
        await checkBookingConflict({
          companionId,
          bookingDate: date,
          bookingTime: time,
          hours,
        });

      if (conflict.conflict) {
        return res.status(409).json({
          success: false,
          message: conflict.message,
        });
      }

      const numericHours = Number(hours);

      const totalAmount =
        numericHours * actualHourlyRate;

      const booking =
        await Booking.create({
          customer: req.user.id,

          companion: companion._id,

          companionName: companion.name,

          service: String(
            service
          ).trim(),

          date: String(
            date
          ).trim(),

          time: String(
            time
          ).trim(),

          hours: numericHours,

          hourlyRate:
            actualHourlyRate,

          totalAmount,

          notes: String(
            notes || ''
          ).trim(),

          status: 'pending',

          visitStatus: 'not_started',
        });

      await createNotification({
        recipient: companion._id,

        type: 'booking_created',

        title: 'New Booking Request',

        message:
          `${req.user.email || 'A customer'} has sent you a new ${service} booking request.`,

        booking: booking._id,
      });

      return res.status(201).json({
        success: true,

        message:
          'Booking request created successfully.',

        booking:
          await Booking.findById(
            booking._id
          )
            .populate(
              'customer',
              'name email phone country'
            )
            .populate(
              'companion',
              'name email country'
            ),
      });
    } catch (error) {
      console.error(
        'CREATE BOOKING ERROR:',
        error
      );

      return res.status(500).json({
        success: false,
        message:
          'Unable to create booking.',
      });
    }
  }
);

// =====================================================
// CUSTOMER BOOKINGS
// GET /api/bookings/my
// =====================================================

router.get(
  '/my',
  authenticateToken,
  requireCustomer,
  async (req, res) => {
    try {
      const bookings =
        await Booking.find({
          customer: req.user.id,
        })
          .populate(
            'customer',
            'name email phone country'
          )
          .populate(
            'companion',
            'name email phone country countryCode profileImage companionProfile'
          )
          .sort({
            createdAt: -1,
          })
          .lean();

      return res.status(200).json({
        success: true,
        count: bookings.length,
        bookings,
      });
    } catch (error) {
      console.error(
        'GET CUSTOMER BOOKINGS ERROR:',
        error
      );

      return res.status(500).json({
        success: false,
        message:
          'Unable to load your bookings.',
      });
    }
  }
);

// =====================================================
// COMPANION REQUESTS
// GET /api/bookings/companion/requests
// =====================================================

router.get(
  '/companion/requests',
  authenticateToken,
  requireCompanion,
  async (req, res) => {
    try {
      const bookings =
        await Booking.find({
          companion: req.user.id,
          status: 'pending',
        })
          .populate(
            'customer',
            'name email phone country'
          )
          .populate(
            'companion',
            'name email country'
          )
          .sort({
            createdAt: -1,
          })
          .lean();

      return res.status(200).json({
        success: true,
        count: bookings.length,
        bookings,
      });
    } catch (error) {
      console.error(
        'GET COMPANION REQUESTS ERROR:',
        error
      );

      return res.status(500).json({
        success: false,
        message:
          'Unable to load booking requests.',
      });
    }
  }
);

// =====================================================
// COMPANION ALL BOOKINGS
// GET /api/bookings/companion/my
// =====================================================

router.get(
  '/companion/my',
  authenticateToken,
  requireCompanion,
  async (req, res) => {
    try {
      const bookings =
        await Booking.find({
          companion: req.user.id,
        })
          .populate(
            'customer',
            'name email phone country'
          )
          .populate(
            'companion',
            'name email country'
          )
          .sort({
            createdAt: -1,
          })
          .lean();

      return res.status(200).json({
        success: true,
        count: bookings.length,
        bookings,
      });
    } catch (error) {
      console.error(
        'GET COMPANION BOOKINGS ERROR:',
        error
      );

      return res.status(500).json({
        success: false,
        message:
          'Unable to load companion bookings.',
      });
    }
  }
);

// =====================================================
// ACCEPT
// PATCH /api/bookings/:id/accept
// =====================================================

router.patch(
  '/:id/accept',
  authenticateToken,
  requireCompanion,
  async (req, res) => {
    try {
      const booking =
        await Booking.findOne({
          _id: req.params.id,
          companion: req.user.id,
          status: 'pending',
        });

      if (!booking) {
        return res.status(404).json({
          success: false,
          message:
            'Pending booking not found.',
        });
      }

      booking.status = 'confirmed';
      booking.acceptedAt = new Date();

      await booking.save();

      await createNotification({
        recipient: booking.customer,

        type: 'booking_accepted',

        title: 'Booking Accepted',

        message:
          `Your ${booking.service} booking with ${booking.companionName} has been accepted.`,

        booking: booking._id,
      });

      return res.status(200).json({
        success: true,

        message:
          'Booking accepted successfully.',

        booking,
      });
    } catch (error) {
      console.error(
        'ACCEPT BOOKING ERROR:',
        error
      );

      return res.status(500).json({
        success: false,
        message:
          'Unable to accept booking.',
      });
    }
  }
);

// =====================================================
// REJECT
// PATCH /api/bookings/:id/reject
// =====================================================

router.patch(
  '/:id/reject',
  authenticateToken,
  requireCompanion,
  async (req, res) => {
    try {
      const booking =
        await Booking.findOne({
          _id: req.params.id,
          companion: req.user.id,
          status: 'pending',
        });

      if (!booking) {
        return res.status(404).json({
          success: false,
          message:
            'Pending booking not found.',
        });
      }

      booking.status = 'rejected';
      booking.rejectedAt = new Date();

      await booking.save();

      await createNotification({
        recipient: booking.customer,

        type: 'booking_rejected',

        title: 'Booking Rejected',

        message:
          `Your ${booking.service} booking request with ${booking.companionName} was rejected.`,

        booking: booking._id,
      });

      return res.status(200).json({
        success: true,

        message:
          'Booking rejected successfully.',

        booking,
      });
    } catch (error) {
      console.error(
        'REJECT BOOKING ERROR:',
        error
      );

      return res.status(500).json({
        success: false,
        message:
          'Unable to reject booking.',
      });
    }
  }
);

// =====================================================
// VISIT CHECK-IN
// PATCH /api/bookings/:id/check-in
// =====================================================

router.patch(
  '/:id/check-in',
  authenticateToken,
  requireCompanion,
  async (req, res) => {
    try {
      const booking =
        await Booking.findOne({
          _id: req.params.id,
          companion: req.user.id,
        });

      if (!booking) {
        return res.status(404).json({
          success: false,
          message: 'Booking not found.',
        });
      }

      if (booking.status !== 'confirmed') {
        return res.status(400).json({
          success: false,
          message:
            'Only confirmed bookings can be checked in.',
        });
      }

      if (
        booking.visitStatus === 'checked_in'
      ) {
        return res.status(400).json({
          success: false,
          message:
            'This visit is already checked in.',
        });
      }

      if (
        booking.visitStatus === 'checked_out'
      ) {
        return res.status(400).json({
          success: false,
          message:
            'This visit has already been completed.',
        });
      }

      const location =
        parseLocation(req.body);

      if (location === 'INVALID') {
        return res.status(400).json({
          success: false,
          message:
            'Invalid latitude or longitude.',
        });
      }

      const note = String(
        req.body?.note || ''
      ).trim();

      booking.visitStatus = 'checked_in';
      booking.checkInAt = new Date();

      booking.checkInNote = note;

      if (location) {
        booking.checkInLocation = location;
      }

      await booking.save();

      await createNotification({
        recipient: booking.customer,

        type: 'visit_checked_in',

        title: 'Companion Has Arrived',

        message:
          `${booking.companionName || 'Your companion'} has checked in and started the visit.`,

        booking: booking._id,
      });

      return res.status(200).json({
        success: true,

        message:
          'Visit checked in successfully.',

        booking,
      });
    } catch (error) {
      console.error(
        'CHECK-IN ERROR:',
        error
      );

      return res.status(500).json({
        success: false,
        message:
          'Unable to check in this visit.',
      });
    }
  }
);

// =====================================================
// VISIT CHECK-OUT
// PATCH /api/bookings/:id/check-out
// =====================================================

router.patch(
  '/:id/check-out',
  authenticateToken,
  requireCompanion,
  async (req, res) => {
    try {
      const booking =
        await Booking.findOne({
          _id: req.params.id,
          companion: req.user.id,
        });

      if (!booking) {
        return res.status(404).json({
          success: false,
          message: 'Booking not found.',
        });
      }

      if (
        booking.visitStatus !== 'checked_in'
      ) {
        return res.status(400).json({
          success: false,
          message:
            'You must check in before checking out.',
        });
      }

      if (
        booking.visitStatus === 'checked_out'
      ) {
        return res.status(400).json({
          success: false,
          message:
            'This visit is already checked out.',
        });
      }

      const location =
        parseLocation(req.body);

      if (location === 'INVALID') {
        return res.status(400).json({
          success: false,
          message:
            'Invalid latitude or longitude.',
        });
      }

      const note = String(
        req.body?.note || ''
      ).trim();

      booking.visitStatus = 'checked_out';
      booking.checkOutAt = new Date();

      booking.checkOutNote = note;

      if (location) {
        booking.checkOutLocation =
          location;
      }

      // Visit is completed after check-out.
      booking.status = 'completed';
      booking.completedAt = new Date();

      await booking.save();

      await createNotification({
        recipient: booking.customer,

        type: 'visit_checked_out',

        title: 'Visit Completed',

        message:
          `${booking.companionName || 'Your companion'} has completed the visit.`,

        booking: booking._id,
      });

      return res.status(200).json({
        success: true,

        message:
          'Visit checked out successfully.',

        booking,
      });
    } catch (error) {
      console.error(
        'CHECK-OUT ERROR:',
        error
      );

      return res.status(500).json({
        success: false,
        message:
          'Unable to check out this visit.',
      });
    }
  }
);

// =====================================================
// COMPLETE
// PATCH /api/bookings/:id/complete
// =====================================================

router.patch(
  '/:id/complete',
  authenticateToken,
  requireCompanion,
  async (req, res) => {
    try {
      const booking =
        await Booking.findOne({
          _id: req.params.id,
          companion: req.user.id,
          status: 'confirmed',
        });

      if (!booking) {
        return res.status(404).json({
          success: false,
          message:
            'Confirmed booking not found.',
        });
      }

      booking.status = 'completed';
      booking.completedAt = new Date();

      await booking.save();

      await createNotification({
        recipient: booking.customer,

        type: 'booking_completed',

        title: 'Booking Completed',

        message:
          `Your ${booking.service} booking with ${booking.companionName} has been completed.`,

        booking: booking._id,
      });

      return res.status(200).json({
        success: true,

        message:
          'Booking marked as completed.',

        booking,
      });
    } catch (error) {
      console.error(
        'COMPLETE BOOKING ERROR:',
        error
      );

      return res.status(500).json({
        success: false,
        message:
          'Unable to complete booking.',
      });
    }
  }
);

// =====================================================
// GET SINGLE BOOKING
// GET /api/bookings/:id
// =====================================================

router.get(
  '/:id',
  authenticateToken,
  async (req, res) => {
    try {
      const booking =
        await Booking.findById(
          req.params.id
        )
          .populate(
            'customer',
            'name email phone country'
          )
          .populate(
            'companion',
            'name email country countryCode profileImage companionProfile'
          )
          .lean();

      if (!booking) {
        return res.status(404).json({
          success: false,
          message: 'Booking not found.',
        });
      }

      const isCustomer =
        String(
          booking.customer?._id
        ) === String(req.user.id);

      const isCompanion =
        String(
          booking.companion?._id
        ) === String(req.user.id);

      if (!isCustomer && !isCompanion) {
        return res.status(403).json({
          success: false,
          message:
            'You are not allowed to view this booking.',
        });
      }

      return res.status(200).json({
        success: true,
        booking,
      });
    } catch (error) {
      console.error(
        'GET BOOKING ERROR:',
        error
      );

      return res.status(500).json({
        success: false,
        message:
          'Unable to load booking.',
      });
    }
  }
);

// =====================================================
// CANCEL
// PATCH /api/bookings/:id/cancel
// =====================================================

router.patch(
  '/:id/cancel',
  authenticateToken,
  requireCustomer,
  async (req, res) => {
    try {
      const booking =
        await Booking.findOne({
          _id: req.params.id,
          customer: req.user.id,
          status: {
            $in: [
              'pending',
              'confirmed',
            ],
          },
        });

      if (!booking) {
        return res.status(404).json({
          success: false,
          message:
            'Active booking not found.',
        });
      }

      if (
        booking.visitStatus === 'checked_in'
      ) {
        return res.status(400).json({
          success: false,
          message:
            'A visit that has already started cannot be cancelled.',
        });
      }

      booking.status = 'cancelled';
      booking.cancelledAt = new Date();
      booking.cancelledBy = req.user.id;

      booking.cancellationReason =
        String(
          req.body?.reason || ''
        ).trim();

      await booking.save();

      await createNotification({
        recipient: booking.companion,

        type: 'system',

        title: 'Booking Cancelled',

        message:
          `The customer cancelled the ${booking.service} booking scheduled for ${booking.date} at ${booking.time}.`,

        booking: booking._id,
      });

      return res.status(200).json({
        success: true,

        message:
          'Booking cancelled successfully.',

        booking,
      });
    } catch (error) {
      console.error(
        'CANCEL BOOKING ERROR:',
        error
      );

      return res.status(500).json({
        success: false,
        message:
          'Unable to cancel booking.',
      });
    }
  }
);

// =====================================================
// EXPORT
// =====================================================

module.exports = router;