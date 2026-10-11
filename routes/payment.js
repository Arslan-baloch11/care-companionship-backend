const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const Booking = require('../models/Booking');

const router = express.Router();

// ========================================
// AUTHENTICATION
// ========================================

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
    console.error('PAYMENT AUTH ERROR:', error.message);

    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token.',
    });
  }
}

// ========================================
// CREATE / RECORD PAYMENT METHOD
// POST /api/payment/create
// ========================================

router.post('/create', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'customer') {
      return res.status(403).json({
        success: false,
        message: 'Only customers can submit payment details.',
      });
    }

    const bookingId = String(req.body.bookingId || '').trim();

    const paymentMethod = String(
      req.body.paymentMethod || ''
    )
      .trim()
      .toLowerCase();

    console.log('PAYMENT REQUEST:', {
      bookingId,
      customerId: req.user.id,
      paymentMethod,
    });

    // Validate booking ID
    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid booking ID.',
      });
    }

    // Validate method
    const allowedMethods = ['card', 'paypal', 'cash'];

    if (!allowedMethods.includes(paymentMethod)) {
      return res.status(400).json({
        success: false,
        message: 'Please select a valid payment method.',
      });
    }

    // Find booking by its actual MongoDB ID
    const booking = await Booking.findById(bookingId);

    if (!booking) {
      console.error(
        'PAYMENT BOOKING NOT FOUND:',
        bookingId
      );

      return res.status(404).json({
        success: false,
        message: 'Booking not found. Please check the booking ID.',
      });
    }

    // Confirm that this booking belongs to the logged-in customer
    const bookingCustomerId = String(
      booking.customer?._id || booking.customer || ''
    );

    if (bookingCustomerId !== String(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: 'This booking does not belong to your account.',
      });
    }

    // Save the selected method.
    // This prototype does not charge a real card or PayPal account.
    booking.paymentMethod = paymentMethod;
    booking.paymentStatus = 'pending';

    if (booking.transactionId == null) {
      booking.transactionId = '';
    }

    await booking.save();

    const amount = Number(
      booking.totalAmount ??
      (
        Number(booking.hourlyRate || 0) *
        Number(booking.hours || 0)
      )
    );

    console.log('PAYMENT METHOD SAVED:', {
      bookingId: String(booking._id),
      paymentMethod,
      paymentStatus: booking.paymentStatus,
      amount,
    });

    return res.status(200).json({
      success: true,
      message:
        paymentMethod === 'cash'
          ? 'Cash / Pay Later selected successfully. No online payment was charged.'
          : 'Payment method recorded in demo mode. No real payment was charged.',
      payment: {
        bookingId: String(booking._id),
        amount,
        paymentMethod,
        status: booking.paymentStatus,
        transactionId: booking.transactionId || '',
      },
    });
  } catch (error) {
    console.error('CREATE PAYMENT ERROR:', error);

    return res.status(500).json({
      success: false,
      message: 'Unable to save the payment method.',
    });
  }
});

module.exports = router;