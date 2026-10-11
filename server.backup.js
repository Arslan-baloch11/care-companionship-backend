
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: true,
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
const authRoutes = require('./routes/auth');
const companionRoutes = require('./routes/companions');
const bookingRoutes = require('./routes/booking');
const messageRoutes = require('./routes/messages');
const reviewRoutes = require('./routes/reviews');
const availabilityRoutes = require('./routes/availability');
const notificationRoutes = require('./routes/notifications');
const profileRoutes = require('./routes/profile');
const paymentRoutes = require('./routes/payment');
const adminRoutes = require('./routes/admin');

// API route mounting
app.use('/api/auth', authRoutes);
app.use('/api/companions', companionRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/availability', availabilityRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/admin', adminRoutes);

// Home route
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Homecare Companionship API is running',
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'API is healthy',
    database:
      mongoose.connection.readyState === 1
        ? 'connected'
        : 'disconnected',
  });
});

// Database test
app.get('/api/db-test', async (req, res) => {
  try {
    await mongoose.connection.db.admin().ping();

    res.json({
      success: true,
      message: 'MongoDB connected successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'MongoDB connection test failed',
      error: error.message,
    });
  }
});

// Environment validation
if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI is missing from backend/.env');
  process.exit(1);
}

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is missing from backend/.env');
  process.exit(1);
}

// Connect to MongoDB and start server
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('MongoDB connected successfully');

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/api/health`);
    });
  })
  .catch((error) => {
    console.error('MongoDB connection failed:', error.message);
    process.exit(1);
  });
