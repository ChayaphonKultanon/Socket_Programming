const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

// Create HTTP server + Socket.IO
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

// In-memory state
// socket.id -> username
const userBySocket = new Map();
// username -> socket
const socketByUser = new Map();
// groupName -> { name, members: Set<username>, owner: username, private: boolean, pending: Set<username> }
const groups = new Map();

// Initialize world chat (after userBySocket is declared)
const initWorldChat = require('./worldChat');
const worldChat = initWorldChat(io, userBySocket);

const listUsers = () => Array.from(socketByUser.keys()).sort();
const listGroups = () =>
  Array.from(groups.values()).map((g) => ({
    name: g.name,
    members: Array.from(g.members).sort(),
    owner: g.owner,
    private: !!g.private,
    pending: Array.from(g.pending || []).sort(),
  }));

const dmRoom = (u1, u2) => `dm:${[u1, u2].sort().join("|")}`;
const groupRoom = (groupName) => `group:${groupName}`;

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  // R3: Register unique username
  socket.on("register", (username, ack) => {
    try {
      if (typeof username !== "string" || !username.trim()) {
        return ack && ack({ ok: false, error: "Username is required" });
      }
      username = username.trim();
      if (socketByUser.has(username)) {
        return ack && ack({ ok: false, error: "Username already taken" });
      }

      // Bind
      userBySocket.set(socket.id, username);
      socketByUser.set(username, socket);

      // Notify everyone about users update (R4)
      io.emit("users:update", listUsers());

      // Ack with current state
      return ack && ack({ ok: true, users: listUsers(), groups: listGroups() });
    } catch (e) {
      return ack && ack({ ok: false, error: "Register failed" });
    }
  });

  // R9: List groups
  socket.on("groups:list", (ack) => {
    return ack && ack({ ok: true, groups: listGroups() });
  });

  // R8: Create group (creator is the only initial member). Accept either string or { name, private }
  socket.on("groups:create", (payload, ack) => {
    const username = userBySocket.get(socket.id);
    if (!username) return ack && ack({ ok: false, error: "Not registered" });
    let groupName;
    let isPrivate = false;
    if (typeof payload === 'string') groupName = payload;
    else if (payload && typeof payload.name === 'string') {
      groupName = payload.name;
      isPrivate = !!payload.private;
    }
    if (typeof groupName !== "string" || !groupName.trim()) {
      return ack && ack({ ok: false, error: "Group name required" });
    }
    groupName = groupName.trim();
    if (groups.has(groupName)) {
      return ack && ack({ ok: false, error: "Group already exists" });
    }
    const g = { name: groupName, members: new Set([username]), owner: username, private: isPrivate, pending: new Set() };
    groups.set(groupName, g);

    // Join socket to the group's room
    socket.join(groupRoom(groupName));

    io.emit("groups:update", listGroups());
    return ack && ack({ ok: true, group: { name: groupName, members: [username], owner: username, private: isPrivate } });
  });

  // R10: Join group by themselves (for public groups). For private groups, this should be a request.
  socket.on("groups:join", (groupName, ack) => {
    const username = userBySocket.get(socket.id);
    if (!username) return ack && ack({ ok: false, error: "Not registered" });
    if (!groups.has(groupName)) {
      return ack && ack({ ok: false, error: "Group not found" });
    }
    const g = groups.get(groupName);
    if (g.private) {
      return ack && ack({ ok: false, error: "Group is private; request to join instead" });
    }
    if (!g.members.has(username)) {
      g.members.add(username);
      socket.join(groupRoom(groupName));
      io.emit("groups:update", listGroups());
    }
    return ack && ack({ ok: true, group: { name: g.name, members: Array.from(g.members) } });
  });

  // R13: Request to join a private group
  socket.on("groups:requestJoin", (groupName, ack) => {
    const username = userBySocket.get(socket.id);
    if (!username) return ack && ack({ ok: false, error: "Not registered" });
    if (!groups.has(groupName)) return ack && ack({ ok: false, error: "Group not found" });
    const g = groups.get(groupName);
    if (!g.private) return ack && ack({ ok: false, error: "Group is public; use join instead" });
    if (g.members.has(username)) return ack && ack({ ok: false, error: "Already a member" });
    if (g.pending.has(username)) return ack && ack({ ok: false, error: "Request already pending" });
    g.pending.add(username);
    // Notify owner if online
    const ownerSocket = socketByUser.get(g.owner);
    if (ownerSocket) {
      ownerSocket.emit('groups:join:request', { groupName, requester: username });
    }
    io.emit("groups:update", listGroups());
    return ack && ack({ ok: true, pending: true });
  });

  // R14: Owner approves a pending request
  socket.on("groups:approve", (payload, ack) => {
    const username = userBySocket.get(socket.id);
    if (!username) return ack && ack({ ok: false, error: "Not registered" });
    let groupName, target;
    if (payload && typeof payload === 'object') {
      groupName = payload.groupName;
      target = payload.username;
    } else if (Array.isArray(arguments) && arguments.length >= 2) {
      groupName = arguments[0];
      target = arguments[1];
    }
    if (!groups.has(groupName)) return ack && ack({ ok: false, error: "Group not found" });
    const g = groups.get(groupName);
    if (g.owner !== username) return ack && ack({ ok: false, error: "Only owner can approve requests" });
    if (!g.pending.has(target)) return ack && ack({ ok: false, error: "No pending request from that user" });
    g.pending.delete(target);
    g.members.add(target);
    // If target is online, make them join the room
    const targetSocket = socketByUser.get(target);
    if (targetSocket) targetSocket.join(groupRoom(groupName));
    io.emit("groups:update", listGroups());
    if (targetSocket) targetSocket.emit('groups:approved', { groupName });
    return ack && ack({ ok: true });
  });

  // R15: Owner rejects a pending request
  socket.on("groups:reject", (payload, ack) => {
    const username = userBySocket.get(socket.id);
    if (!username) return ack && ack({ ok: false, error: "Not registered" });
    let groupName, target;
    if (payload && typeof payload === 'object') {
      groupName = payload.groupName;
      target = payload.username;
    } else if (Array.isArray(arguments) && arguments.length >= 2) {
      groupName = arguments[0];
      target = arguments[1];
    }
    if (!groups.has(groupName)) return ack && ack({ ok: false, error: "Group not found" });
    const g = groups.get(groupName);
    if (g.owner !== username) return ack && ack({ ok: false, error: "Only owner can reject requests" });
    if (!g.pending.has(target)) return ack && ack({ ok: false, error: "No pending request from that user" });
    g.pending.delete(target);
    io.emit("groups:update", listGroups());
    const targetSocket = socketByUser.get(target);
    if (targetSocket) targetSocket.emit('groups:rejected', { groupName });
    return ack && ack({ ok: true });
  });

  // R12: Delete a group (allowed by any member)
  socket.on("groups:delete", (groupName, ack) => {
    const username = userBySocket.get(socket.id);
    if (!username) return ack && ack({ ok: false, error: "Not registered" });
    if (typeof groupName !== "string" || !groupName.trim()) {
      return ack && ack({ ok: false, error: "Group name required" });
    }
    groupName = groupName.trim();
    if (!groups.has(groupName)) return ack && ack({ ok: false, error: "Group not found" });
    const g = groups.get(groupName);
    if (!g.members.has(username)) return ack && ack({ ok: false, error: "Only group members can delete the group" });

    // Remove group and make members leave the room (for online members)
    groups.delete(groupName);
    for (const member of g.members) {
      const s = socketByUser.get(member);
      if (s) s.leave(groupRoom(groupName));
    }

    io.emit("groups:update", listGroups());
    return ack && ack({ ok: true });
  });

  // R11: Send message to a group (only members will receive because of room)
  socket.on("group:message", (payload, ack) => {
    const username = userBySocket.get(socket.id);
    if (!username) return ack && ack({ ok: false, error: "Not registered" });
    const { groupName, text } = payload || {};
    if (!groupName || typeof text !== "string" || !text.trim()) {
      return ack && ack({ ok: false, error: "groupName and text are required" });
    }
    const g = groups.get(groupName);
    if (!g || !g.members.has(username)) {
      return ack && ack({ ok: false, error: "Not a member of this group" });
    }
    const message = {
      room: groupRoom(groupName),
      groupName,
      type: "group",
      from: username,
      text: text.trim(),
      timestamp: Date.now(),
    };
    io.to(groupRoom(groupName)).emit("group:message", message);
    return ack && ack({ ok: true });
  });

  // R7 + R5: Private direct message chat room per pair
  socket.on("dm:start", (toUsername, ack) => {
    const fromUsername = userBySocket.get(socket.id);
    if (!fromUsername) return ack && ack({ ok: false, error: "Not registered" });
    if (typeof toUsername !== "string" || !toUsername.trim()) {
      return ack && ack({ ok: false, error: "Target username required" });
    }
    toUsername = toUsername.trim();
    if (!socketByUser.has(toUsername)) {
      return ack && ack({ ok: false, error: "Target user offline" });
    }
    const room = dmRoom(fromUsername, toUsername);
    const targetSocket = socketByUser.get(toUsername);

    // Join both sockets to the DM room
    socket.join(room);
    targetSocket.join(room);

    // Notify both clients they can open this DM room
    const payload = { room, type: "dm", with: [fromUsername, toUsername].sort() };
    socket.emit("dm:ready", payload);
    targetSocket.emit("dm:ready", payload);
    return ack && ack({ ok: true, room });
  });

  socket.on("dm:message", (payload, ack) => {
    const fromUsername = userBySocket.get(socket.id);
    if (!fromUsername) return ack && ack({ ok: false, error: "Not registered" });
    const { room, text } = payload || {};
    if (!room || typeof text !== "string" || !text.trim()) {
      return ack && ack({ ok: false, error: "room and text are required" });
    }
    const message = {
      room,
      type: "dm",
      from: fromUsername,
      text: text.trim(),
      timestamp: Date.now(),
    };
    io.to(room).emit("dm:message", message);
    return ack && ack({ ok: true });
  });

  // Utility: client can explicitly request users list
  socket.on("users:list", (ack) => {
    return ack && ack({ ok: true, users: listUsers() });
  });

  socket.on("disconnect", () => {
    const username = userBySocket.get(socket.id);
    if (username) {
      userBySocket.delete(socket.id);
      socketByUser.delete(username);

      // Remove from all groups
      for (const g of groups.values()) {
        if (g.members.has(username)) g.members.delete(username);
      }
      // Broadcast updates
      io.emit("users:update", listUsers());
      io.emit("groups:update", listGroups());
      console.log(`User disconnected: ${username} (${socket.id})`);
    } else {
      console.log("Socket disconnected:", socket.id);
    }
  });
});

const PORT = 4000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
