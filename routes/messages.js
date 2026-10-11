const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const Message = require('../models/Message');
const User = require('../models/User');

const router = express.Router();

const isValidId = (value) =>
  typeof value === 'string' &&
  mongoose.Types.ObjectId.isValid(value) &&
  /^[a-fA-F0-9]{24}$/.test(value);

function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';

    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in again.',
      });
    }

    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET is missing from backend environment.');
      return res.status(500).json({
        success: false,
        message: 'Server authentication configuration is missing.',
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Support common JWT user ID field names.
    const userId =
      decoded.id ||
      decoded._id ||
      decoded.userId ||
      decoded.user_id ||
      decoded.sub;

    if (!userId || !isValidId(String(userId))) {
      return res.status(401).json({
        success: false,
        message: 'Your login token does not contain a valid user ID. Please log in again.',
      });
    }

    req.user = {
      ...decoded,
      id: String(userId),
    };

    next();
  } catch (error) {
    console.error('MESSAGE AUTH ERROR:', error.message);

    return res.status(401).json({
      success: false,
      message: 'Invalid or expired login session. Please log in again.',
    });
  }
}

function formatUser(user) {
  if (!user) return null;

  return {
    _id: String(user._id),
    name: user.name || 'User',
    email: user.email || '',
    role: user.role || '',
    profileImage: user.profileImage || '',
  };
}

function handleRouteError(res, error, label) {
  console.error(`${label}:`, error);

  if (error instanceof mongoose.Error.CastError) {
    return res.status(400).json({
      success: false,
      message: 'Invalid user or message ID.',
    });
  }

  return res.status(500).json({
    success: false,
    message: `${label}. Please try again.`,
  });
}

// GET /api/messages/conversations
router.get('/conversations', authenticateToken, async (req, res) => {
  try {
    const currentUserId = req.user.id;

    const messages = await Message.find({
      $or: [
        { sender: currentUserId },
        { receiver: currentUserId },
      ],
    })
      .sort({ createdAt: -1 })
      .populate('sender', 'name email role profileImage')
      .populate('receiver', 'name email role profileImage')
      .lean();

    const conversationMap = new Map();

    for (const message of messages) {
      const senderId = message.sender?._id
        ? String(message.sender._id)
        : '';

      const receiverId = message.receiver?._id
        ? String(message.receiver._id)
        : '';

      const otherUserId =
        senderId === currentUserId ? receiverId : senderId;

      if (!otherUserId) continue;

      if (!conversationMap.has(otherUserId)) {
        const otherUser =
          senderId === currentUserId
            ? message.receiver
            : message.sender;

        conversationMap.set(otherUserId, {
          user: formatUser(otherUser),
          lastMessage: {
            _id: message._id,
            text: message.text,
            createdAt: message.createdAt,
            read: message.read,
            senderId,
          },
          unreadCount: 0,
        });
      }

      if (
        receiverId === currentUserId &&
        message.read === false
      ) {
        conversationMap.get(otherUserId).unreadCount += 1;
      }
    }

    return res.status(200).json({
      success: true,
      conversations: Array.from(conversationMap.values()),
    });
  } catch (error) {
    return handleRouteError(
      res,
      error,
      'Failed to load conversations'
    );
  }
});

// GET /api/messages/unread-count
router.get('/unread-count', authenticateToken, async (req, res) => {
  try {
    const count = await Message.countDocuments({
      receiver: req.user.id,
      read: false,
    });

    return res.status(200).json({
      success: true,
      count,
    });
  } catch (error) {
    return handleRouteError(
      res,
      error,
      'Failed to get unread count'
    );
  }
});

// GET /api/messages/:userId
router.get('/:userId', authenticateToken, async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const otherUserId = String(req.params.userId || '');

    if (!isValidId(otherUserId)) {
      return res.status(400).json({
        success: false,
        message: 'A valid recipient user ID is required.',
      });
    }

    if (currentUserId === otherUserId) {
      return res.status(400).json({
        success: false,
        message: 'You cannot chat with yourself.',
      });
    }

    const otherUser = await User.findById(otherUserId).select(
      'name email role profileImage'
    );

    if (!otherUser) {
      return res.status(404).json({
        success: false,
        message: 'Recipient user was not found.',
      });
    }

    const messages = await Message.find({
      $or: [
        {
          sender: currentUserId,
          receiver: otherUserId,
        },
        {
          sender: otherUserId,
          receiver: currentUserId,
        },
      ],
    })
      .sort({ createdAt: 1 })
      .limit(500)
      .populate('sender', 'name email role profileImage')
      .populate('receiver', 'name email role profileImage')
      .lean();

    await Message.updateMany(
      {
        sender: otherUserId,
        receiver: currentUserId,
        read: false,
      },
      {
        $set: {
          read: true,
          readAt: new Date(),
        },
      }
    );

    return res.status(200).json({
      success: true,
      user: formatUser(otherUser),
      messages,
    });
  } catch (error) {
    return handleRouteError(res, error, 'Failed to load chat');
  }
});

// POST /api/messages
router.post('/', authenticateToken, async (req, res) => {
  try {
    const senderId = req.user.id;

    const {
      receiverId,
      recipientId,
      receiver,
      text,
      bookingId,
      booking,
    } = req.body || {};

    const finalReceiverId = String(
      receiverId || recipientId || receiver || ''
    ).trim();

    if (!isValidId(finalReceiverId)) {
      return res.status(400).json({
        success: false,
        message:
          'A valid receiver ID is required. Open the conversation from the correct customer or companion profile.',
      });
    }

    if (finalReceiverId === senderId) {
      return res.status(400).json({
        success: false,
        message: 'You cannot send a message to yourself.',
      });
    }

    const cleanText = String(text || '').trim();

    if (!cleanText) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a message before sending.',
      });
    }

    if (cleanText.length > 5000) {
      return res.status(400).json({
        success: false,
        message: 'Message cannot exceed 5000 characters.',
      });
    }

    const receiverUser = await User.findById(finalReceiverId).select(
      'name email role profileImage isActive'
    );

    if (!receiverUser) {
      return res.status(404).json({
        success: false,
        message: 'Recipient user was not found.',
      });
    }

    if (receiverUser.isActive === false) {
      return res.status(403).json({
        success: false,
        message: 'This user account is inactive.',
      });
    }

    const finalBookingId = bookingId || booking || null;

    if (finalBookingId && !isValidId(String(finalBookingId))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid booking ID.',
      });
    }

    const messageData = {
      sender: senderId,
      receiver: finalReceiverId,
      text: cleanText,
    };

    if (finalBookingId) {
      messageData.booking = String(finalBookingId);
    }

    const message = await Message.create(messageData);

    const populatedMessage = await Message.findById(message._id)
      .populate('sender', 'name email role profileImage')
      .populate('receiver', 'name email role profileImage')
      .lean();

    return res.status(201).json({
      success: true,
      message: populatedMessage,
    });
  } catch (error) {
    return handleRouteError(res, error, 'Failed to send message');
  }
});

// PATCH /api/messages/:userId/read
router.patch('/:userId/read', authenticateToken, async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const otherUserId = String(req.params.userId || '');

    if (!isValidId(otherUserId)) {
      return res.status(400).json({
        success: false,
        message: 'A valid user ID is required.',
      });
    }

    const result = await Message.updateMany(
      {
        sender: otherUserId,
        receiver: currentUserId,
        read: false,
      },
      {
        $set: {
          read: true,
          readAt: new Date(),
        },
      }
    );

    return res.status(200).json({
      success: true,
      message: 'Messages marked as read.',
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    return handleRouteError(
      res,
      error,
      'Failed to mark messages as read'
    );
  }
});

module.exports = router;