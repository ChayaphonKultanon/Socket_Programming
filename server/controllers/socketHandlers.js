const { userBySocket, socketByUser, groups, listUsers, listGroups, dmRoom, groupRoom } = require("../lib/state");
const db = require("../lib/db");
const User = require("../models/User");
const Group = require("../models/Group");
const Message = require("../models/Message");

// Attempt to connect if MONGO_URI present
db.connect(process.env.MONGO_URI).catch((e) => {
  // connection errors are logged in db.connect
});

function registerSocketHandlers(io) {
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

        // Persist user (upsert)
        try {
          if (db && process.env.MONGO_URI) {
            User.findOneAndUpdate({ username }, { username, online: true, lastSeen: new Date() }, { upsert: true }).exec().catch(() => {});
          }
        } catch (e) {
          // ignore DB errors for now
        }

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

    // R8: Create group (creator is the only initial member)
    socket.on("groups:create", (groupName, ack) => {
      const username = userBySocket.get(socket.id);
      if (!username) return ack && ack({ ok: false, error: "Not registered" });
      if (typeof groupName !== "string" || !groupName.trim()) {
        return ack && ack({ ok: false, error: "Group name required" });
      }
      groupName = groupName.trim();
      if (groups.has(groupName)) {
        return ack && ack({ ok: false, error: "Group already exists" });
      }
      const g = { name: groupName, members: new Set([username]) };
      groups.set(groupName, g);

      // persist group
      try {
        if (db && process.env.MONGO_URI) {
          Group.create({ name: groupName, members: [username] }).catch(() => {});
        }
      } catch (e) {}

      // Join socket to the group's room
      socket.join(groupRoom(groupName));

      io.emit("groups:update", listGroups());
      return ack && ack({ ok: true, group: { name: groupName, members: [username] } });
    });

    // R10: Join group by themselves
    socket.on("groups:join", (groupName, ack) => {
      const username = userBySocket.get(socket.id);
      if (!username) return ack && ack({ ok: false, error: "Not registered" });
      if (!groups.has(groupName)) {
        return ack && ack({ ok: false, error: "Group not found" });
      }
      const g = groups.get(groupName);
      if (!g.members.has(username)) {
        g.members.add(username);
        socket.join(groupRoom(groupName));
        io.emit("groups:update", listGroups());
        // persist membership
        try {
          if (db && process.env.MONGO_URI) {
            Group.findOneAndUpdate({ name: groupName }, { $addToSet: { members: username } }).exec().catch(() => {});
          }
        } catch (e) {}
      }
      return ack && ack({ ok: true, group: { name: g.name, members: Array.from(g.members) } });
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
      // persist message
      try {
        if (db && process.env.MONGO_URI) {
          Message.create({ ...message }).catch(() => {});
        }
      } catch (e) {}
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
      // persist DM message
      try {
        if (db && process.env.MONGO_URI) {
          Message.create({ ...message }).catch(() => {});
        }
      } catch (e) {}
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
        // persist offline state
        try {
          if (db && process.env.MONGO_URI) {
            User.findOneAndUpdate({ username }, { online: false, lastSeen: new Date() }).exec().catch(() => {});
          }
        } catch (e) {}
      } else {
        console.log("Socket disconnected:", socket.id);
      }
    });
  });
}

module.exports = { registerSocketHandlers };
