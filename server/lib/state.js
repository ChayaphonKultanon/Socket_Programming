// In-memory state and helpers for the chat server
// Keeps the same runtime shape as the previous index.js but isolated here

const userBySocket = new Map(); // socket.id -> username
const socketByUser = new Map(); // username -> socket
const groups = new Map(); // groupName -> { name, members: Set }

const listUsers = () => Array.from(socketByUser.keys()).sort();
const listGroups = () =>
  Array.from(groups.values()).map((g) => ({
    name: g.name,
    members: Array.from(g.members).sort(),
  }));

const dmRoom = (u1, u2) => `dm:${[u1, u2].sort().join("|")}`;
const groupRoom = (groupName) => `group:${groupName}`;

module.exports = {
  userBySocket,
  socketByUser,
  groups,
  listUsers,
  listGroups,
  dmRoom,
  groupRoom,
};
