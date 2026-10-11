const express = require('express');
const jwt = require('jsonwebtoken');

const Notification =
    require('../models/Notification');

const router =
    express.Router();

// =====================================================
// AUTHENTICATION
// =====================================================

function authenticate(
    req,
    res,
    next
) {
    try {
        const authHeader =
            req.headers.authorization || '';

        if (
            !authHeader.startsWith(
                'Bearer '
            )
        ) {
            return res.status(401).json({
                success: false,
                message:
                    'Authentication required.',
            });
        }

        const token =
            authHeader.split(
                ' '
            )[1];

        const decoded =
            jwt.verify(
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
                message:
                    'Invalid authentication token.',
            });
        }

        req.user = {
            id:
                String(
                    userId
                ),

            role:
                decoded.role,

            email:
                decoded.email,
        };

        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            message:
                'Invalid or expired token.',
        });
    }
}

// =====================================================
// GET MY NOTIFICATIONS
// =====================================================

router.get(
    '/my',
    authenticate,
    async (
        req,
        res
    ) => {
        try {
            const notifications =
                await Notification.find({
                    recipient:
                        req.user.id,
                })
                    .populate(
                        'booking',
                        '_id status service date time hours hourlyRate totalAmount'
                    )
                    .sort({
                        createdAt: -1,
                    })
                    .limit(100)
                    .lean();

            const unreadCount =
                await Notification.countDocuments(
                    {
                        recipient:
                            req.user.id,

                        isRead:
                            false,
                    }
                );

            return res.status(200).json({
                success: true,

                count:
                    notifications.length,

                unreadCount,

                notifications,
            });
        } catch (error) {
            console.error(
                'GET NOTIFICATIONS ERROR:',
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    'Unable to load notifications.',
            });
        }
    }
);

// =====================================================
// GET UNREAD COUNT
// =====================================================

router.get(
    '/unread-count',
    authenticate,
    async (
        req,
        res
    ) => {
        try {
            const unreadCount =
                await Notification.countDocuments(
                    {
                        recipient:
                            req.user.id,

                        isRead:
                            false,
                    }
                );

            return res.status(200).json({
                success: true,

                unreadCount,
            });
        } catch (error) {
            console.error(
                'UNREAD COUNT ERROR:',
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    'Unable to load unread count.',
            });
        }
    }
);

// =====================================================
// MARK ONE AS READ
// =====================================================

router.patch(
    '/:id/read',
    authenticate,
    async (
        req,
        res
    ) => {
        try {
            const notification =
                await Notification.findOneAndUpdate(
                    {
                        _id:
                            req.params.id,

                        recipient:
                            req.user.id,
                    },
                    {
                        $set: {
                            isRead:
                                true,
                        },
                    },
                    {
                        new: true,
                    }
                );

            if (!notification) {
                return res.status(404).json({
                    success: false,
                    message:
                        'Notification not found.',
                });
            }

            return res.status(200).json({
                success: true,

                message:
                    'Notification marked as read.',

                notification,
            });
        } catch (error) {
            console.error(
                'MARK READ ERROR:',
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    'Unable to mark notification as read.',
            });
        }
    }
);

// =====================================================
// MARK ALL AS READ
// =====================================================

router.patch(
    '/read-all',
    authenticate,
    async (
        req,
        res
    ) => {
        try {
            const result =
                await Notification.updateMany(
                    {
                        recipient:
                            req.user.id,

                        isRead:
                            false,
                    },
                    {
                        $set: {
                            isRead:
                                true,
                        },
                    }
                );

            return res.status(200).json({
                success: true,

                message:
                    'All notifications marked as read.',

                modifiedCount:
                    result.modifiedCount,
            });
        } catch (error) {
            console.error(
                'MARK ALL READ ERROR:',
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    'Unable to mark notifications as read.',
            });
        }
    }
);

// =====================================================
// DELETE ONE
// =====================================================

router.delete(
    '/:id',
    authenticate,
    async (
        req,
        res
    ) => {
        try {
            const deleted =
                await Notification.findOneAndDelete(
                    {
                        _id:
                            req.params.id,

                        recipient:
                            req.user.id,
                    }
                );

            if (!deleted) {
                return res.status(404).json({
                    success: false,
                    message:
                        'Notification not found.',
                });
            }

            return res.status(200).json({
                success: true,

                message:
                    'Notification deleted.',
            });
        } catch (error) {
            console.error(
                'DELETE NOTIFICATION ERROR:',
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    'Unable to delete notification.',
            });
        }
    }
);

module.exports =
    router;