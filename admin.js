
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const User = require('../models/User');
const Booking = require('../models/Booking');

const router = express.Router();

// Protect all admin endpoints.
async function requireAdmin(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';

    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Admin login required. Please provide a valid token.',
      });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        success: false,
        message: 'Server authentication is not configured.',
      });
    }

    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId =
      decoded.userId || decoded.id || decoded._id || decoded.sub;

    if (!userId || !mongoose.isValidObjectId(userId)) {
      return res.status(401).json({
        success: false,
        message: 'Invalid authentication token.',
      });
    }

    const admin = await User.findById(userId)
      .select('_id name email role isActive');

    if (
      !admin ||
      admin.role !== 'admin' ||
      admin.isActive === false
    ) {
      return res.status(403).json({
        success: false,
        message: 'Admin access denied.',
      });
    }

    req.admin = admin;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token. Please sign in again.',
    });
  }
}

router.use(requireAdmin);

// GET /api/admin/dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const [
      totalCustomers,
      totalCompanions,
      totalBookings,
      paidBookings,
      pendingBookings,
      completedBookings,
      cancelledBookings,
      paymentStats,
    ] = await Promise.all([
      User.countDocuments({ role: 'customer' }),
      User.countDocuments({ role: 'companion' }),
      Booking.countDocuments({}),
      Booking.countDocuments({ paymentStatus: 'paid' }),
      Booking.countDocuments({ status: 'pending' }),
      Booking.countDocuments({ status: 'completed' }),
      Booking.countDocuments({ status: 'cancelled' }),
      Booking.aggregate([
        {
          $group: {
            _id: null,
            totalAmount: { $sum: '$totalAmount' },
            paidAmount: {
              $sum: {
                $cond: [
                  { $eq: ['$paymentStatus', 'paid'] },
                  '$totalAmount',
                  0,
                ],
              },
            },
            pendingAmount: {
              $sum: {
                $cond: [
                  { $in: ['$paymentStatus', ['pending', 'unpaid']] },
                  '$totalAmount',
                  0,
                ],
              },
            },
          },
        },
      ]),
    ]);

    const amounts = paymentStats[0] || {
      totalAmount: 0,
      paidAmount: 0,
      pendingAmount: 0,
    };

    return res.json({
      success: true,
      admin: {
        name: req.admin.name,
        email: req.admin.email,
      },
      dashboard: {
        totalCustomers,
        totalCompanions,
        totalBookings,
        totalPayments: await Booking.countDocuments({
          paymentStatus: { $in: ['paid', 'pending', 'failed', 'refunded', 'unpaid'] },
        }),
        paidBookings,
        pendingBookings,
        completedBookings,
        cancelledBookings,
        totalAmount: amounts.totalAmount || 0,
        paidAmount: amounts.paidAmount || 0,
        pendingAmount: amounts.pendingAmount || 0,
      },
    });
  } catch (error) {
    console.error('ADMIN DASHBOARD ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'Unable to load dashboard data.',
    });
  }
});

// GET /api/admin/customers
router.get('/customers', async (req, res) => {
  try {
    const customers = await User.find({ role: 'customer' })
      .select('name email phone country isActive isVerified createdAt')
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    res.json({ success: true, customers });
  } catch (error) {
    console.error('ADMIN CUSTOMERS ERROR:', error);
    res.status(500).json({
      success: false,
      message: 'Unable to load customers.',
    });
  }
});

// GET /api/admin/companions
router.get('/companions', async (req, res) => {
  try {
    const companions = await User.find({ role: 'companion' })
      .select(
        'name email phone country isActive isVerified companionProfile createdAt'
      )
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    res.json({ success: true, companions });
  } catch (error) {
    console.error('ADMIN COMPANIONS ERROR:', error);
    res.status(500).json({
      success: false,
      message: 'Unable to load companions.',
    });
  }
});

// GET /api/admin/bookings
router.get('/bookings', async (req, res) => {
  try {
    const bookings = await Booking.find({})
      .populate('customer', 'name email phone')
      .populate('companion', 'name email phone')
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    res.json({ success: true, bookings });
  } catch (error) {
    console.error('ADMIN BOOKINGS ERROR:', error);
    res.status(500).json({
      success: false,
      message: 'Unable to load bookings.',
    });
  }
});

// GET /api/admin/payments
// Payments are stored on Booking documents in this project.
router.get('/payments', async (req, res) => {
  try {
    const payments = await Booking.find({
      paymentStatus: {
        $in: ['paid', 'pending', 'failed', 'refunded', 'unpaid'],
      },
    })
      .select(
        'customer companion companionName service date totalAmount paymentMethod paymentStatus transactionId status createdAt'
      )
      .populate('customer', 'name email')
      .populate('companion', 'name email')
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    res.json({ success: true, payments });
  } catch (error) {
    console.error('ADMIN PAYMENTS ERROR:', error);
    res.status(500).json({
      success: false,
      message: 'Unable to load payment records.',
    });
  }
});

module.exports = router;
