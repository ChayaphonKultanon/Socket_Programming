/**
 * presenceService
 * Maintains mapping between socket ids and usernames and provides helper functions
 */
const userBySocket = new Map(); // socket.id -> username
const socketByUser = new Map(); // username -> socket
// in-memory last-read timestamps when DB isn't available: username -> Map(room -> timestamp)
const lastReadByUser = new Map();

module.exports = {
  add: (socketId, username, socket) => {
    userBySocket.set(socketId, username);
    socketByUser.set(username, socket);
  },
  removeBySocket: (socketId) => {
    const username = userBySocket.get(socketId);
    userBySocket.delete(socketId);
    if (username) socketByUser.delete(username);
    return username;
  },
  getUsername: (socketId) => userBySocket.get(socketId),
  getSocket: (username) => socketByUser.get(username),
  hasUser: (username) => socketByUser.has(username),
  listUsers: () => Array.from(socketByUser.keys()).sort(),
  getAll: () => ({ userBySocket, socketByUser }),
  // last-read helpers (in-memory fallback)
  setLastRead: (username, room, ts) => {
    if (!lastReadByUser.has(username)) lastReadByUser.set(username, new Map());
    lastReadByUser.get(username).set(room, ts);
  },
  getLastReadMap: (username) => {
    return lastReadByUser.has(username) ? new Map(lastReadByUser.get(username)) : new Map();
  },
};
