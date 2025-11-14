// ============================================
// FILE: src/socket/socketEvents.js
// ============================================

// const logger = require('../utils/logger.js');

const handleJoinUser = (socket, senderId) => {
  socket.join(`user:${senderId}`);
  socket.emit("connected");
  logger.info(`👤 User ${senderId} joined personal room: user:${senderId}`);
};

const handleJoinChat = (socket, data) => {
  const { senderId, receiverId } = data;

  if (!senderId || !receiverId) {
    logger.error("❌ Missing senderId or receiverId in join-chat");
    return;
  }

  const chatRoomId = [senderId, receiverId].sort().join('-');

  socket.join(`chat:${chatRoomId}`);
  logger.info(`💬 User ${senderId} joined chat room: chat:${chatRoomId}`);

  socket.emit("joined-chat", { chatRoomId: `chat:${chatRoomId}` });
};

const handleSendMessage = (io, socket, data) => {
  try {
    const { receiverId, senderId, message } = data;

    if (!receiverId || !senderId || !message) {
      socket.emit("error", { message: "Missing required fields" });
      return;
    }

    const chatRoomId = [senderId, receiverId].sort().join('-');

    io.to(`chat:${chatRoomId}`).emit('receive-message', message);

    logger.info(`✅ Message sent to chat room: chat:${chatRoomId}`);
  } catch (err) {
    socket.emit("error", { message: "Failed to send message" });
  }
};

const handleTyping = (socket, data) => {
  try {
    const { senderId, receiverId } = data;
    const chatRoomId = [senderId, receiverId].sort().join('-');

    socket.to(`chat:${chatRoomId}`).emit('user-typing', { userId: senderId });
  } catch (err) {
    console.error("⚠️ Error handling typing:", err);
  }
};

const handleStopTyping = (socket, data) => {
  try {
    const { senderId, receiverId } = data;
    const chatRoomId = [senderId, receiverId].sort().join('-');

    socket.to(`chat:${chatRoomId}`).emit('user-stop-typing', { userId: senderId });
  } catch (err) {
    console.error("⚠️ Error handling stop-typing:", err);
  }
};

const handleLeaveChat = (socket, data) => {
  try {
    const { senderId, receiverId } = data;
    const chatRoomId = [senderId, receiverId].sort().join('-');

    socket.leave(`chat:${chatRoomId}`);

    logger.info(`👋 User ${senderId} left chat room: chat:${chatRoomId}`);
  } catch (err) {
    console.error("⚠️ Error handling leave-chat:", err);
  }
};

module.exports = {
  handleJoinUser,
  handleJoinChat,
  handleSendMessage,
  handleTyping,
  handleStopTyping,
  handleLeaveChat,
};
