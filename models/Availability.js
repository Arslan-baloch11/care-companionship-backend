const mongoose = require('mongoose');

// =====================================================
// TIME SLOT
// =====================================================

const timeSlotSchema =
    new mongoose.Schema(
        {
            start: {
                type: String,
                required: true,
                trim: true,
                match: /^([01]\d|2[0-3]):[0-5]\d$/,
            },

            end: {
                type: String,
                required: true,
                trim: true,
                match: /^([01]\d|2[0-3]):[0-5]\d$/,
            },
        },
        {
            _id: false,
        }
    );

// =====================================================
// WEEKLY SCHEDULE
// =====================================================

const weeklyScheduleSchema =
    new mongoose.Schema(
        {
            day: {
                type: String,
                required: true,

                enum: [
                    'monday',
                    'tuesday',
                    'wednesday',
                    'thursday',
                    'friday',
                    'saturday',
                    'sunday',
                ],
            },

            enabled: {
                type: Boolean,
                default: false,
            },

            slots: {
                type: [timeSlotSchema],
                default: [],
            },
        },
        {
            _id: false,
        }
    );

// =====================================================
// BLOCKED DATE
// =====================================================

const blockedDateSchema =
    new mongoose.Schema(
        {
            date: {
                type: String,
                required: true,
                trim: true,
                match: /^\d{4}-\d{2}-\d{2}$/,
            },

            reason: {
                type: String,
                trim: true,
                maxlength: 300,
                default: '',
            },
        },
        {
            _id: false,
        }
    );

// =====================================================
// AVAILABILITY
// =====================================================

const availabilitySchema =
    new mongoose.Schema(
        {
            companion: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
                required: true,

                // ONE COMPANION = ONE AVAILABILITY DOCUMENT
                unique: true,

                index: true,
            },

            timeZone: {
                type: String,
                trim: true,
                default: 'UTC',
            },

            isAvailable: {
                type: Boolean,
                default: false,
            },

            weeklySchedule: {
                type: [weeklyScheduleSchema],
                default: [],
            },

            blockedDates: {
                type: [blockedDateSchema],
                default: [],
            },

            bufferMinutes: {
                type: Number,
                min: 0,
                max: 240,
                default: 0,
            },
        },
        {
            timestamps: true,
        }
    );

// =====================================================
// IMPORTANT
// =====================================================
// Do NOT add:
// availabilitySchema.index({ companion: 1 });
//
// companion already has index: true above.
// This prevents the duplicate index warning.
// =====================================================

module.exports =
    mongoose.model(
        'Availability',
        availabilitySchema
    );