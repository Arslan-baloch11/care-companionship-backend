const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const User = require('../models/User');
const Booking = require('../models/Booking');
const Review = require('../models/Review');

const router = express.Router();

// ======================================================
// AUTHENTICATION
// ======================================================

const authenticate = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (
      !authHeader ||
      !authHeader.startsWith('Bearer ')
    ) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
      });
    }

    const token =
      authHeader.split(' ')[1];

    const decoded =
      jwt.verify(
        token,
        process.env.JWT_SECRET
      );

    req.user = decoded;

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token.',
    });
  }
};

// ======================================================
// ADMIN ONLY
// ======================================================

const adminOnly = (req, res, next) => {
  if (
    !req.user ||
    req.user.role !== 'admin'
  ) {
    return res.status(403).json({
      success: false,
      message: 'Admin access required.',
    });
  }

  next();
};

// Apply authentication + admin check
router.use(
  authenticate,
  adminOnly
);

// ======================================================
// ADMIN DASHBOARD STATS
// ======================================================

router.get(
  '/stats',
  async (req, res) => {
    try {
      const [
        totalUsers,
        totalCustomers,
        totalCompanions,
        verifiedCompanions,
        activeUsers,
        totalBookings,
        pendingBookings,
        confirmedBookings,
        completedBookings,
        cancelledBookings,
        rejectedBookings,
        totalReviews,
      ] = await Promise.all([
        User.countDocuments(),

        User.countDocuments({
          role: 'customer',
        }),

        User.countDocuments({
          role: 'companion',
        }),

        User.countDocuments({
          role: 'companion',
          isVerified: true,
        }),

        User.countDocuments({
          isActive: true,
        }),

        Booking.countDocuments(),

        Booking.countDocuments({
          status: 'pending',
        }),

        Booking.countDocuments({
          status: 'confirmed',
        }),

        Booking.countDocuments({
          status: 'completed',
        }),

        Booking.countDocuments({
          status: 'cancelled',
        }),

        Booking.countDocuments({
          status: 'rejected',
        }),

        Review.countDocuments(),
      ]);

      const revenueResult =
        await Booking.aggregate([
          {
            $match: {
              status: {
                $in: [
                  'confirmed',
                  'completed',
                ],
              },

              paymentStatus: 'paid',
            },
          },

          {
            $group: {
              _id: null,
              totalRevenue: {
                $sum: '$paymentAmount',
              },
            },
          },
        ]);

      const totalRevenue =
        revenueResult.length > 0
          ? Number(
              revenueResult[0]
                .totalRevenue || 0
            )
          : 0;

      return res.json({
        success: true,

        stats: {
          users: {
            total: totalUsers,
            customers: totalCustomers,
            companions: totalCompanions,
            active: activeUsers,
          },

          companions: {
            total: totalCompanions,
            verified:
              verifiedCompanions,
            unverified:
              totalCompanions -
              verifiedCompanions,
          },

          bookings: {
            total: totalBookings,
            pending: pendingBookings,
            confirmed:
              confirmedBookings,
            completed:
              completedBookings,
            cancelled:
              cancelledBookings,
            rejected:
              rejectedBookings,
          },

          reviews: {
            total: totalReviews,
          },

          revenue: {
            total: Number(
              totalRevenue.toFixed(2)
            ),
            currency: 'USD',
          },
        },
      });
    } catch (error) {
      console.error(
        'ADMIN STATS ERROR:',
        error
      );

      return res.status(500).json({
        success: false,
        message:
          'Failed to load admin statistics.',
      });
    }
  }
);

// ======================================================
// GET ALL USERS
// ======================================================

router.get(
  '/users',
  async (req, res) => {
    try {
      const page = Math.max(
        Number(req.query.page) || 1,
        1
      );

      const limit = Math.min(
        Math.max(
          Number(req.query.limit) || 20,
          1
        ),
        100
      );

      const skip =
        (page - 1) * limit;

      const search =
        String(
          req.query.search || ''
        ).trim();

      const role =
        String(
          req.query.role || ''
        ).trim();

      const active =
        String(
          req.query.active || ''
        ).trim();

      const filter = {};

      if (search) {
        filter.$or = [
          {
            name: {
              $regex: search,
              $options: 'i',
            },
          },
          {
            email: {
              $regex: search,
              $options: 'i',
            },
          },
          {
            country: {
              $regex: search,
              $options: 'i',
            },
          },
        ];
      }

      if (
        ['customer', 'companion', 'admin']
          .includes(role)
      ) {
        filter.role = role;
      }

      if (active === 'true') {
        filter.isActive = true;
      }

      if (active === 'false') {
        filter.isActive = false;
      }

      const [
        users,
        total,
      ] = await Promise.all([
        User.find(filter)
          .select(
            '-password'
          )
          .sort({
            createdAt: -1,
          })
          .skip(skip)
          .limit(limit),

        User.countDocuments(
          filter
        ),
      ]);

      return res.json({
        success: true,

        users,

        pagination: {
          page,
          limit,
          total,
          pages:
            Math.ceil(
              total / limit
            ),
        },
      });
    } catch (error) {
      console.error(
        'ADMIN USERS ERROR:',
        error
      );

      return res.status(500).json({
        success: false,
        message:
          'Failed to load users.',
      });
    }
  }
);

// ======================================================
// GET ALL COMPANIONS
// ======================================================

router.get(
  '/companions',
  async (req, res) => {
    try {
      const verified =
        String(
          req.query.verified || ''
        );

      const available =
        String(
          req.query.available || ''
        );

      const search =
        String(
          req.query.search || ''
        ).trim();

      const filter = {
        role: 'companion',
      };

      if (verified === 'true') {
        filter.isVerified = true;
      }

      if (verified === 'false') {
        filter.isVerified = false;
      }

      if (available === 'true') {
        filter[
          'companionProfile.isAvailable'
        ] = true;
      }

      if (available === 'false') {
        filter[
          'companionProfile.isAvailable'
        ] = false;
      }

      if (search) {
        filter.$or = [
          {
            name: {
              $regex: search,
              $options: 'i',
            },
          },
          {
            email: {
              $regex: search,
              $options: 'i',
            },
          },
          {
            country: {
              $regex: search,
              $options: 'i',
            },
          },
          {
            'companionProfile.profession':
              {
                $regex: search,
                $options: 'i',
              },
          },
        ];
      }

      const companions =
        await User.find(filter)
          .select('-password')
          .sort({
            createdAt: -1,
          });

      return res.json({
        success: true,
        count:
          companions.length,
        companions,
      });
    } catch (error) {
      console.error(
        'ADMIN COMPANIONS ERROR:',
        error
      );

      return res.status(500).json({
        success: false,
        message:
          'Failed to load companions.',
      });
    }
  }
);

// ======================================================
// VERIFY / UNVERIFY COMPANION
// ======================================================

router.patch(
  '/companions/:id/verify',
  async (req, res) => {
    try {
      if (
        !mongoose.Types.ObjectId.isValid(
          req.params.id
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            'Invalid companion ID.',
        });
      }

      const verified =
        req.body.verified;

      if (
        typeof verified !==
        'boolean'
      ) {
        return res.status(400).json({
          success: false,
          message:
            'verified must be true or false.',
        });
      }

      const companion =
        await User.findOne({
          _id:
            req.params.id,
          role: 'companion',
        }).select('-password');

      if (!companion) {
        return res.status(404).json({
          success: false,
          message:
            'Companion not found.',
        });
      }

      companion.isVerified =
        verified;

      await companion.save();

      return res.json({
        success: true,

        message: verified
          ? 'Companion verified successfully.'
          : 'Companion verification removed.',

        companion,
      });
    } catch (error) {
      console.error(
        'VERIFY COMPANION ERROR:',
        error
      );

      return res.status(500).json({
        success: false,
        message:
          'Failed to update companion verification.',
      });
    }
  }
);

// ======================================================
// ACTIVATE / DEACTIVATE USER
// ======================================================

router.patch(
  '/users/:id/status',
  async (req, res) => {
    try {
      if (
        !mongoose.Types.ObjectId.isValid(
          req.params.id
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            'Invalid user ID.',
        });
      }

      const isActive =
        req.body.isActive;

      if (
        typeof isActive !==
        'boolean'
      ) {
        return res.status(400).json({
          success: false,
          message:
            'isActive must be true or false.',
        });
      }

      const targetUser =
        await User.findById(
          req.params.id
        );

      if (!targetUser) {
        return res.status(404).json({
          success: false,
          message:
            'User not found.',
        });
      }

      // Prevent disabling the admin
      // account currently being used.
      if (
        String(targetUser._id) ===
        String(req.user.id) &&
        !isActive
      ) {
        return res.status(400).json({
          success: false,
          message:
            'You cannot deactivate your own admin account.',
        });
      }

      targetUser.isActive =
        isActive;

      await targetUser.save();

      const safeUser =
        await User.findById(
          targetUser._id
        ).select('-password');

      return res.json({
        success: true,

        message: isActive
          ? 'User activated successfully.'
          : 'User deactivated successfully.',

        user: safeUser,
      });
    } catch (error) {
      console.error(
        'USER STATUS ERROR:',
        error
      );

      return res.status(500).json({
        success: false,
        message:
          'Failed to update user status.',
      });
    }
  }
);

// ======================================================
// GET ALL BOOKINGS
// ======================================================

router.get(
  '/bookings',
  async (req, res) => {
    try {
      const status =
        String(
          req.query.status || ''
        ).trim();

      const paymentStatus =
        String(
          req.query.paymentStatus || ''
        ).trim();

      const filter = {};

      if (
        [
          'pending',
          'confirmed',
          'rejected',
          'cancelled',
          'completed',
        ].includes(status)
      ) {
        filter.status =
          status;
      }

      if (
        [
          'unpaid',
          'pending',
          'paid',
          'failed',
          'refunded',
        ].includes(
          paymentStatus
        )
      ) {
        filter.paymentStatus =
          paymentStatus;
      }

      const bookings =
        await Booking.find(filter)
          .populate(
            'customer',
            'name email phone country'
          )
          .populate(
            'companion',
            'name email phone country isVerified'
          )
          .sort({
            createdAt: -1,
          })
          .limit(200);

      return res.json({
        success: true,
        count:
          bookings.length,
        bookings,
      });
    } catch (error) {
      console.error(
        'ADMIN BOOKINGS ERROR:',
        error
      );

      return res.status(500).json({
        success: false,
        message:
          'Failed to load bookings.',
      });
    }
  }
);

// ======================================================
// GET ALL REVIEWS
// ======================================================

router.get(
  '/reviews',
  async (req, res) => {
    try {
      const reviews =
        await Review.find()
          .populate(
            'customer',
            'name email'
          )
          .populate(
            'companion',
            'name email isVerified'
          )
          .populate(
            'booking',
            'date time service status'
          )
          .sort({
            createdAt: -1,
          })
          .limit(200);

      return res.json({
        success: true,

        count:
          reviews.length,

        reviews,
      });
    } catch (error) {
      console.error(
        'ADMIN REVIEWS ERROR:',
        error
      );

      return res.status(500).json({
        success: false,
        message:
          'Failed to load reviews.',
      });
    }
  }
);

// ======================================================
// PUBLISH / HIDE REVIEW
// ======================================================

router.patch(
  '/reviews/:id/publish',
  async (req, res) => {
    try {
      if (
        !mongoose.Types.ObjectId.isValid(
          req.params.id
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            'Invalid review ID.',
        });
      }

      const isPublished =
        req.body.isPublished;

      if (
        typeof isPublished !==
        'boolean'
      ) {
        return res.status(400).json({
          success: false,
          message:
            'isPublished must be true or false.',
        });
      }

      const review =
        await Review.findById(
          req.params.id
        );

      if (!review) {
        return res.status(404).json({
          success: false,
          message:
            'Review not found.',
        });
      }

      review.isPublished =
        isPublished;

      await review.save();

      return res.json({
        success: true,

        message: isPublished
          ? 'Review published.'
          : 'Review hidden.',

        review,
      });
    } catch (error) {
      console.error(
        'REVIEW PUBLISH ERROR:',
        error
      );

      return res.status(500).json({
        success: false,
        message:
          'Failed to update review.',
      });
    }
  }
);

// ======================================================
// ADMIN - GET SINGLE USER
// ======================================================

router.get(
  '/users/:id',
  async (req, res) => {
    try {
      if (
        !mongoose.Types.ObjectId.isValid(
          req.params.id
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            'Invalid user ID.',
        });
      }

      const user =
        await User.findById(
          req.params.id
        ).select('-password');

      if (!user) {
        return res.status(404).json({
          success: false,
          message:
            'User not found.',
        });
      }

      return res.json({
        success: true,
        user,
      });
    } catch (error) {
      console.error(
        'ADMIN USER DETAIL ERROR:',
        error
      );

      return res.status(500).json({
        success: false,
        message:
          'Failed to load user.',
      });
    }
  }
);

module.exports = router;