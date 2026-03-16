// controllers/messageController.js
const Conversation = require('../models/public/Conversation');
const Message = require('../models/public/Message');
const { getIO } = require('../services/socketService'); // we'll create this

// @desc    Get all conversations for logged in user (should be only one)
// @route   GET /api/users/messages/user/conversations
exports.getUserConversations = async (req, res) => {
  try {
    let conversation = await Conversation.findOne({ user: req.user._id })
      .populate('lastMessage')
      .lean();

    if (!conversation) {
      return res.json([]); // no messages yet
    }

    // Add unread count for user? (optional)
    res.json([conversation]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get messages of a conversation (user)
// @route   GET /api/users/messages/user/conversations/:conversationId
exports.getUserMessages = async (req, res) => {
  try {
    const conversation = await Conversation.findOne({
      _id: req.params.conversationId,
      user: req.user._id,
    });
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    const messages = await Message.find({ conversation: conversation._id })
      .sort({ createdAt: 1 })
      .populate('senderId', 'name avatar') // for admin messages, populate admin name
      .lean();

    res.json(messages);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Send a message from user to admin (creates conversation if needed)
// @route   POST /api/users/messages/user/messages
exports.sendUserMessage = async (req, res) => {
  try {
    const { content } = req.body;
    if (!content && !req.cloudinaryFile) {
      return res.status(400).json({ message: 'Message content or attachment required' });
    }

    // Find or create conversation for this user
    let conversation = await Conversation.findOne({ user: req.user._id });
    if (!conversation) {
      conversation = await Conversation.create({ user: req.user._id });
    }

    // Prepare attachment if any
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
      senderType: 'user',
      senderId: req.user._id,
      senderModel: `${process.env.APP_NAME}_User`,
      content: content || '',
      attachments,
    });

    // Update conversation lastMessage
    conversation.lastMessage = message._id;
    conversation.lastMessageAt = new Date();
    conversation.unreadCount = (conversation.unreadCount || 0) + 1;
    await conversation.save();

    // Populate sender details for socket emission
    const populatedMessage = await Message.findById(message._id)
      .populate('senderId', 'name avatar')
      .lean();

    // Emit to all connected admins (room 'admins')
    const io = getIO();
    io.to('admins').emit('new_message', {
      conversationId: conversation._id,
      message: populatedMessage,
    });

    // Also emit to the specific user's room (optional)
    io.to(`user_${req.user._id}`).emit('message_sent', populatedMessage);

    res.status(201).json(populatedMessage);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};