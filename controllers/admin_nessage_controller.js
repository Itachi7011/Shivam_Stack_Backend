// controllers/adminMessageController.js
const Conversation = require('../models/public/Conversation');
const Message = require('../models/public/Message');
const { getIO } = require('../services/socketService');

// @desc    Get all conversations (for admin)
// @route   GET /api/users/messages/admin/conversations
exports.getAdminConversations = async (req, res) => {
  try {
    const conversations = await Conversation.find({})
      .populate('user', 'name email avatar')
      .populate('lastMessage')
      .sort({ lastMessageAt: -1 })
      .lean();

    // For each conversation, compute unread count (if not stored)
    // We can use the stored unreadCount field
    res.json(conversations);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get messages of a conversation (admin)
// @route   GET /api/users/messages/admin/conversations/:conversationId
exports.getAdminMessages = async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.conversationId);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    const messages = await Message.find({ conversation: conversation._id })
      .sort({ createdAt: 1 })
      .populate('senderId', 'name avatar')
      .lean();

    res.json(messages);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Admin replies to a conversation
// @route   POST /api/users/messages/admin/conversations/:conversationId/reply
exports.adminReply = async (req, res) => {
  try {
    const { content } = req.body;
    if (!content && !req.cloudinaryFile) {
      return res.status(400).json({ message: 'Message content or attachment required' });
    }

    const conversation = await Conversation.findById(req.params.conversationId);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    const attachments = [];
    if (req.cloudinaryFile) {
      attachments.push({
        url: req.cloudinaryFile.data,
        publicId: req.cloudinaryFile.publicId,
        format: req.cloudinaryFile.format,
        originalName: req.cloudinaryFile.originalName,
        contentType: req.cloudinaryFile.contentType,
      });
    }

    // Create message
    const message = await Message.create({
      conversation: conversation._id,
      senderType: 'admin',
      senderId: req.admin._id,
      senderModel: `${process.env.APP_NAME}_Admin`,
      content: content || '',
      attachments,
      // Admin messages are considered read by default? Not necessary.
    });

    // Update conversation lastMessage
    conversation.lastMessage = message._id;
    conversation.lastMessageAt = new Date();
    // Do not increment unreadCount for admin messages (since it's for admins)
    await conversation.save();

    const populatedMessage = await Message.findById(message._id)
      .populate('senderId', 'name')
      .lean();

    // Emit to the specific user's room
    const io = getIO();
    io.to(`user_${conversation.user}`).emit('new_message', {
      conversationId: conversation._id,
      message: populatedMessage,
    });

    // Also emit to all admins (so other admins see the reply)
    io.to('admins').emit('message_reply', {
      conversationId: conversation._id,
      message: populatedMessage,
    });

    res.status(201).json(populatedMessage);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Mark conversation messages as read (by admin)
// @route   PATCH /api/users/messages/admin/conversations/:conversationId/read
exports.markConversationAsRead = async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.conversationId);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    // Find all unread messages from user in this conversation
    const unreadMessages = await Message.find({
      conversation: conversation._id,
      senderType: 'user',
      isRead: false,
    });

    if (unreadMessages.length === 0) {
      return res.json({ message: 'No unread messages' });
    }

    const now = new Date();
    const messageIds = unreadMessages.map(m => m._id);

    // Mark them as read, set firstReadByAdmin if not already set
    await Message.updateMany(
      { _id: { $in: messageIds } },
      {
        $set: {
          isRead: true,
          firstReadByAdmin: { $ifNull: ['$firstReadByAdmin', req.admin._id] },
          firstReadAt: { $ifNull: ['$firstReadAt', now] },
        },
      }
    );

    // Reset unreadCount for admins
    conversation.unreadCount = 0;
    await conversation.save();

    // Emit to admins that messages were read (optional)
    const io = getIO();
    io.to('admins').emit('messages_read', { conversationId: conversation._id });

    res.json({ message: 'Marked as read', count: unreadMessages.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};