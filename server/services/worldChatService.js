/**
 * worldChatService
 * Implements a world chat room: keeps recent history, broadcasts messages to all clients,
 * and exposes getMessages/broadcast API.
 */
const messageService = require('./messageService');

module.exports = function initWorldChat(io, presence) {
  const MAX_HISTORY = 100;
  const messages = [];

  const pushMessage = async (message) => {
    messages.push(message);
    if (messages.length > MAX_HISTORY) messages.shift();
    io.emit('world:message', message);
    // persist if possible but don't block
    try {
      await messageService.save(message);
    } catch (e) {
      /* swallow */
    }
  };

  const onConnection = (socket) => {
    // Send message history to newly connected client
    socket.emit('world:history', [...messages]);

    socket.on('world:message', (payload, ack) => {
      try {
        const { text } = payload || {};
        if (!text || !text.toString().trim())
          return ack && ack({ ok: false, error: 'Message text required' });

        const username =
          presence && typeof presence.getUsername === 'function'
            ? presence.getUsername(socket.id)
            : null;
        const timestamp = new Date().toLocaleTimeString();
        const from = username
          ? `${username}:${timestamp}`
          : `Guest-${socket.id.slice(0, 4)}:${timestamp}`;

        const message = {
          id: Date.now().toString(),
          type: 'world',
          from,
          text: text.toString().trim(),
          timestamp: Date.now(),
        };

        pushMessage(message);
        ack && ack({ ok: true });
      } catch (err) {
        console.error('worldChatService error:', err);
        ack && ack({ ok: false, error: 'Failed to send message' });
      }
    });
  };

  // Attach handler
  io.on('connection', onConnection);

  return {
    getMessages: () => [...messages],
    broadcast: (text, from = 'System') =>
      pushMessage({ id: Date.now().toString(), type: 'world', from, text, timestamp: Date.now() }),
  };
};
