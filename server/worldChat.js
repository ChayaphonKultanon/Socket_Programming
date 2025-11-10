// World chat module for broadcasting messages to all connected users
const initWorldChat = (io, userBySocket) => {
  // Keep recent messages in memory
  const MAX_HISTORY = 100;
  const messages = [];

  const broadcastMessage = (message) => {
    // Add to history (maintain max size)
    messages.push(message);
    if (messages.length > MAX_HISTORY) {
      messages.shift();
    }
    // Broadcast to all connected clients
    io.emit('world:message', message);
  };

  // Handle socket connections
  io.on('connection', (socket) => {
    // Send message history to newly connected client
    socket.emit('world:history', messages);

    // Handle new messages
    socket.on('world:message', (payload, ack) => {
      try {
        const { text } = payload || {};
        if (!text?.trim()) {
          return ack?.({ ok: false, error: 'Message text required' });
        }

        // Look up the registered username from the userBySocket map
        // If not found (e.g., user not registered), use Guest ID with timestamp
        const username = userBySocket.get(socket.id);
        const timestamp = new Date().toLocaleTimeString();
        const from = username 
          ? `${username}:${timestamp}` 
          : `Guest-${socket.id.slice(0, 4)}:${timestamp}`;

        const message = {
          id: Date.now().toString(),
          type: 'world',
          from: from,
          text: text.trim(),
          timestamp: Date.now()
        };

        broadcastMessage(message);
        ack?.({ ok: true });
      } catch (err) {
        console.error('World chat error:', err);
        ack?.({ ok: false, error: 'Failed to send message' });
      }
    });
  });

  return {
    getMessages: () => [...messages],
    broadcast: (text, from = 'System') => {
      broadcastMessage({
        id: Date.now().toString(),
        type: 'world',
        from,
        text,
        timestamp: Date.now()
      });
    }
  };
};

module.exports = initWorldChat;