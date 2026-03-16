const express = require('express');
const router = express.Router();
const { userAuthenticate } = require('../middleware/userAuth');
const { adminAuthenticate } = require('../middleware/adminAuth');
const { cloudinarySingleUpload } = require('../middleware/cloudinaryUploader');

// Import controllers (to be created)
const {
  getUserConversations,
  getUserMessages,
  sendUserMessage,
} = require('../controllers/message_controller');

const {
  getAdminConversations,
  getAdminMessages,
  adminReply,
  markConversationAsRead,
} = require('../controllers/admin_nessage_controller');

// ---------- User routes ----------
router.use('/user', userAuthenticate); // all user routes require user login

router.get('/user/conversations', getUserConversations);
router.get('/user/conversations/:conversationId', getUserMessages);
router.post('/user/messages', cloudinarySingleUpload('attachment', 'message_attachments'), sendUserMessage);

// ---------- Admin routes ----------
router.use('/admin', adminAuthenticate); // all admin routes require admin login

router.get('/admin/conversations', getAdminConversations);
router.get('/admin/conversations/:conversationId', getAdminMessages);
router.post('/admin/conversations/:conversationId/reply', cloudinarySingleUpload('attachment', 'message_attachments'), adminReply);
router.patch('/admin/conversations/:conversationId/read', markConversationAsRead);

module.exports = router;