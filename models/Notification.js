const mongoose = require('mongoose');

// =====================================================
// NOTIFICATION SCHEMA
// =====================================================

const notificationSchema =
    new mongoose.Schema(
        {
            recipient: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
                required: true,
                index: true,
            },

            type: {
                type: String,
                required: true,
                enum: [
                    'booking_created',
                    'booking_accepted',
                    'booking_rejected',
                    'booking_completed',
                    'review_received',
                    'system',
                ],
                trim: true,
            },

            title: {
                type: String,
                required: true,
                trim: true,
                maxlength: 150,
            },

            message: {
                type: String,
                required: true,
                trim: true,
                maxlength: 500,
            },

            booking: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Booking',
                default: null,
            },

            review: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Review',
                default: null,
            },

            isRead: {
                type: Boolean,
                default: false,
                index: true,
            },
        },
        {
            timestamps: true,
        }
    );

// =====================================================
// INDEXES
// =====================================================

notificationSchema.index({
    recipient: 1,
    createdAt: -1,
});

notificationSchema.index({
    recipient: 1,
    isRead: 1,
});

module.exports =
    mongoose.model(
        'Notification',
        notificationSchema
    );