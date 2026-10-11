const express = require('express');
const jwt = require('jsonwebtoken');
const Review = require('../models/Review');
const Booking = require('../models/Booking');
const User = require('../models/User');

const router = express.Router();

// =====================================================
// AUTH MIDDLEWARE
// =====================================================

function authenticateToken(req, res, next) {
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

    const token = authHeader.split(' ')[1];

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    req.userId = decoded.userId;

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token.',
    });
  }
}

// =====================================================
// CREATE REVIEW
// =====================================================

router.post(
  '/',
  authenticateToken,
  async (req, res) => {
    try {
      const {
        bookingId,
        rating,
        comment,
      } = req.body;

      if (!bookingId) {
        return res.status(400).json({
          success: false,
          message: 'Booking ID is required.',
        });
      }

      const numericRating = Number(rating);

      if (
        !Number.isFinite(
          numericRating
        ) ||
        numericRating < 1 ||
        numericRating > 5
      ) {
        return res.status(400).json({
          success: false,
          message:
            'Rating must be between 1 and 5.',
        });
      }

      // -----------------------------------------------
      // FIND BOOKING
      // -----------------------------------------------

      const booking =
        await Booking.findOne({
          _id: bookingId,
          customer: req.userId,
        });

      if (!booking) {
        return res.status(404).json({
          success: false,
          message:
            'Booking not found or you are not authorized to review it.',
        });
      }

      // -----------------------------------------------
      // BOOKING MUST BE COMPLETED
      // -----------------------------------------------

      if (booking.status !== 'completed') {
        return res.status(400).json({
          success: false,
          message:
            'You can review a booking only after it is completed.',
        });
      }

      // -----------------------------------------------
      // COMPANION REQUIRED
      // -----------------------------------------------

      if (!booking.companion) {
        return res.status(400).json({
          success: false,
          message:
            'This booking is not linked to a companion.',
        });
      }

      const companion =
        await User.findOne({
          _id: booking.companion,
          role: 'companion',
        });

      if (!companion) {
        return res.status(404).json({
          success: false,
          message:
            'Companion account was not found.',
        });
      }

      // -----------------------------------------------
      // PREVENT DUPLICATE REVIEW
      // -----------------------------------------------

      const existingReview =
        await Review.findOne({
          booking: booking._id,
        });

      if (existingReview) {
        return res.status(409).json({
          success: false,
          message:
            'You have already reviewed this booking.',
        });
      }

      // -----------------------------------------------
      // CREATE REVIEW
      // -----------------------------------------------

      const review =
        await Review.create({
          booking: booking._id,
          customer: req.userId,
          companion: companion._id,
          rating: numericRating,
          comment:
            typeof comment === 'string'
              ? comment.trim()
              : '',
          isPublished: true,
        });

      const populatedReview =
        await Review.findById(
          review._id
        )
          .populate(
            'customer',
            'name email'
          )
          .populate(
            'companion',
            'name email role'
          )
          .populate(
            'booking',
            'service date time'
          );

      // -----------------------------------------------
      // CALCULATE NEW STATS
      // -----------------------------------------------

      const stats =
        await Review.aggregate([
          {
            $match: {
              companion:
                companion._id,
              isPublished: true,
            },
          },
          {
            $group: {
              _id: '$companion',
              averageRating: {
                $avg: '$rating',
              },
              reviewCount: {
                $sum: 1,
              },
            },
          },
        ]);

      const averageRating =
        stats.length > 0
          ? Number(
              stats[0].averageRating.toFixed(
                1
              )
            )
          : 0;

      const reviewCount =
        stats.length > 0
          ? stats[0].reviewCount
          : 0;

      return res.status(201).json({
        success: true,
        message:
          'Review submitted successfully.',
        review: populatedReview,
        stats: {
          averageRating,
          reviewCount,
        },
      });
    } catch (error) {
      console.error(
        'CREATE REVIEW ERROR:',
        error
      );

      // Duplicate index protection
      if (error.code === 11000) {
        return res.status(409).json({
          success: false,
          message:
            'You have already reviewed this booking.',
        });
      }

      return res.status(500).json({
        success: false,
        message:
          'Server error while creating review.',
      });
    }
  }
);

// =====================================================
// GET COMPANION REVIEWS
// =====================================================

router.get(
  '/companion/:companionId',
  async (req, res) => {
    try {
      const companionId =
        req.params.companionId;

      const companion =
        await User.findOne({
          _id: companionId,
          role: 'companion',
        }).select(
          'name email role profileImage bio'
        );

      if (!companion) {
        return res.status(404).json({
          success: false,
          message:
            'Companion not found.',
        });
      }

      const reviews =
        await Review.find({
          companion: companionId,
          isPublished: true,
        })
          .sort({
            createdAt: -1,
          })
          .populate(
            'customer',
            'name profileImage'
          );

      const stats =
        await Review.aggregate([
          {
            $match: {
              companion:
                companion._id,
              isPublished: true,
            },
          },
          {
            $group: {
              _id: '$companion',
              averageRating: {
                $avg: '$rating',
              },
              reviewCount: {
                $sum: 1,
              },
            },
          },
        ]);

      const averageRating =
        stats.length > 0
          ? Number(
              stats[0].averageRating.toFixed(
                1
              )
            )
          : 0;

      const reviewCount =
        stats.length > 0
          ? stats[0].reviewCount
          : 0;

      return res.status(200).json({
        success: true,
        companion,
        stats: {
          averageRating,
          reviewCount,
        },
        reviews,
      });
    } catch (error) {
      console.error(
        'GET COMPANION REVIEWS ERROR:',
        error
      );

      return res.status(500).json({
        success: false,
        message:
          'Server error while loading reviews.',
      });
    }
  }
);

// =====================================================
// GET REVIEW FOR BOOKING
// =====================================================

router.get(
  '/booking/:bookingId',
  authenticateToken,
  async (req, res) => {
    try {
      const booking =
        await Booking.findOne({
          _id: req.params.bookingId,
          customer: req.userId,
        });

      if (!booking) {
        return res.status(404).json({
          success: false,
          message:
            'Booking not found.',
        });
      }

      const review =
        await Review.findOne({
          booking:
            booking._id,
        })
          .populate(
            'customer',
            'name email'
          )
          .populate(
            'companion',
            'name email role'
          );

      return res.status(200).json({
        success: true,
        hasReview:
          !!review,
        review: review || null,
      });
    } catch (error) {
      console.error(
        'GET BOOKING REVIEW ERROR:',
        error
      );

      return res.status(500).json({
        success: false,
        message:
          'Server error while checking review.',
      });
    }
  }
);

// =====================================================
// GET MY REVIEWS
// =====================================================

router.get(
  '/my',
  authenticateToken,
  async (req, res) => {
    try {
      const reviews =
        await Review.find({
          customer: req.userId,
        })
          .sort({
            createdAt: -1,
          })
          .populate(
            'companion',
            'name email role profileImage'
          )
          .populate(
            'booking',
            'service date time totalAmount'
          );

      return res.status(200).json({
        success: true,
        reviews,
      });
    } catch (error) {
      console.error(
        'GET MY REVIEWS ERROR:',
        error
      );

      return res.status(500).json({
        success: false,
        message:
          'Server error while loading your reviews.',
      });
    }
  }
);

module.exports = router;