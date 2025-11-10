const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const User = require('./models/User');
const Message = require('./models/Message');

const app = express();
app.use(cors());

dotenv.config({ path: './.env' });

// Create HTTP server + Socket.IO
const port = process.env.PORT;
const server = app.listen(port, '0.0.0.0', () => {
  console.log('Listening on', port);
});

const io = new Server(server, {
  cors: {
    origin: ['http://localhost:3000'],
    methods: ['GET','POST'],
    credentials: true
  }
});

// Mongo connection
const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
  console.warn('MONGO_URI not set; persistence disabled');
} else {
  mongoose.connect(mongoUri, { dbName: 'socket_chat' })
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error('MongoDB connection error:', err.message));
}

// In-memory state (online presence & groups)
const userBySocket = new Map(); // socket.id -> username
const socketByUser = new Map(); // username -> socket
const groups = new Map(); // groupName -> { name, members:Set, owner, private, pending:Set }

// Initialize world chat (after userBySocket is declared)
const initWorldChat = require('./worldChat');
const worldChat = initWorldChat(io, userBySocket);

const listUsers = () => Array.from(socketByUser.keys()).sort();
const listGroups = () => Array.from(groups.values()).map(g => ({
  name: g.name,
  members: Array.from(g.members).sort(),
  owner: g.owner,
  private: !!g.private,
  pending: Array.from(g.pending).sort()
}));

const dmRoom = (u1, u2) => `dm:${[u1,u2].sort().join('|')}`;
const groupRoom = (g) => `group:${g}`;

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

      // Register
      socket.on('register', (username, ack) => {
        try {
          if (typeof username !== 'string' || !username.trim()) return ack && ack({ ok:false, error:'Username is required' });
          username = username.trim();
          if (socketByUser.has(username)) return ack && ack({ ok:false, error:'Username already taken' });

          userBySocket.set(socket.id, username);
          socketByUser.set(username, socket);
          if (mongoose.connection.readyState === 1) {
            User.findOneAndUpdate(
              { username },
              { $set:{ username }, $currentDate:{ lastSeenAt:true } },
              { upsert:true, new:true }
            ).exec().catch(()=>{});
          }
          io.emit('users:update', listUsers());
          ack && ack({ ok:true, users:listUsers(), groups:listGroups() });

          // Auto-join any group rooms where this user is already a member (e.g., owner returning)
          for (const g of groups.values()) {
            if (g.members.has(username)) {
              socket.join(groupRoom(g.name));
            }
          }

          // Load DM history (last 200 messages involving user)
          (async () => {
            try {
              if (mongoose.connection.readyState !== 1) return;
                const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const re = new RegExp(`^dm:(?:${esc(username)}\|.+|.+\|${esc(username)})$`);
                const msgs = await Message.find({ type:'dm', room: re })
                  .sort({ timestamp:-1 })
                  .limit(200)
                  .lean();
                const byRoom = {};
                for (const m of msgs.reverse()) {
                  if (!byRoom[m.room]) byRoom[m.room] = [];
                  byRoom[m.room].push({ room:m.room, type:m.type, from:m.from, text:m.text, timestamp:m.timestamp });
                }
                if (Object.keys(byRoom).length) socket.emit('history:load', byRoom);
            } catch (e) {
              console.error('History load failed:', e.message);
            }
          })();
        } catch (e) {
          ack && ack({ ok:false, error:'Register failed' });
        }
      });

      // List groups
      socket.on('groups:list', (ack) => ack && ack({ ok:true, groups:listGroups() }));

      // Create group
      socket.on('groups:create', (payload, ack) => {
        const username = userBySocket.get(socket.id);
        if (!username) return ack && ack({ ok:false, error:'Not registered' });
        let groupName; let isPrivate = false;
        if (typeof payload === 'string') groupName = payload; else if (payload && typeof payload.name === 'string') { groupName = payload.name; isPrivate = !!payload.private; }
        if (!groupName || !groupName.trim()) return ack && ack({ ok:false, error:'Group name required' });
        groupName = groupName.trim();
        if (groups.has(groupName)) return ack && ack({ ok:false, error:'Group already exists' });
        const g = { name:groupName, members:new Set([username]), owner:username, private:isPrivate, pending:new Set() };
        groups.set(groupName, g);
        socket.join(groupRoom(groupName));
        io.emit('groups:update', listGroups());
        ack && ack({ ok:true, group:{ name:groupName, members:[username], owner:username, private:isPrivate } });
      });

      // Join group (public only)
      socket.on('groups:join', (groupName, ack) => {
        const username = userBySocket.get(socket.id);
        if (!username) return ack && ack({ ok:false, error:'Not registered' });
        if (!groups.has(groupName)) return ack && ack({ ok:false, error:'Group not found' });
        const g = groups.get(groupName);
        if (g.private) return ack && ack({ ok:false, error:'Group is private; request instead' });
        if (!g.members.has(username)) {
          g.members.add(username);
          socket.join(groupRoom(groupName));
          io.emit('groups:update', listGroups());
        }
        ack && ack({ ok:true, group:{ name:g.name, members:Array.from(g.members) } });
      });

      // Request join private group
      socket.on('groups:requestJoin', (groupName, ack) => {
        const username = userBySocket.get(socket.id);
        if (!username) return ack && ack({ ok:false, error:'Not registered' });
        const g = groups.get(groupName);
        if (!g) return ack && ack({ ok:false, error:'Group not found' });
        if (!g.private) return ack && ack({ ok:false, error:'Group is public; use join' });
        if (g.members.has(username)) return ack && ack({ ok:false, error:'Already member' });
        if (g.pending.has(username)) return ack && ack({ ok:false, error:'Already requested' });
        g.pending.add(username);
        const ownerSocket = socketByUser.get(g.owner);
        if (ownerSocket) ownerSocket.emit('groups:join:request', { groupName, requester:username });
        io.emit('groups:update', listGroups());
        ack && ack({ ok:true, pending:true });
      });

      // Approve private request
      socket.on('groups:approve', (payload, ack) => {
        const username = userBySocket.get(socket.id);
        if (!username) return ack && ack({ ok:false, error:'Not registered' });
        const { groupName, username:target } = payload || {};
        const g = groups.get(groupName);
        if (!g) return ack && ack({ ok:false, error:'Group not found' });
        if (g.owner !== username) return ack && ack({ ok:false, error:'Only owner can approve' });
        if (!g.pending.has(target)) return ack && ack({ ok:false, error:'No pending request' });
        g.pending.delete(target);
        g.members.add(target);
        const targetSocket = socketByUser.get(target);
        if (targetSocket) targetSocket.join(groupRoom(groupName));
        io.emit('groups:update', listGroups());
        if (targetSocket) targetSocket.emit('groups:approved', { groupName });
        ack && ack({ ok:true });
      });

      // Reject private request
      socket.on('groups:reject', (payload, ack) => {
        const username = userBySocket.get(socket.id);
        if (!username) return ack && ack({ ok:false, error:'Not registered' });
        const { groupName, username:target } = payload || {};
        const g = groups.get(groupName);
        if (!g) return ack && ack({ ok:false, error:'Group not found' });
        if (g.owner !== username) return ack && ack({ ok:false, error:'Only owner can reject' });
        if (!g.pending.has(target)) return ack && ack({ ok:false, error:'No pending request' });
        g.pending.delete(target);
        io.emit('groups:update', listGroups());
        const targetSocket = socketByUser.get(target);
        if (targetSocket) targetSocket.emit('groups:rejected', { groupName });
        ack && ack({ ok:true });
      });

      // Delete group
      socket.on('groups:delete', (groupName, ack) => {
        const username = userBySocket.get(socket.id);
        if (!username) return ack && ack({ ok:false, error:'Not registered' });
        if (!groupName || !groupName.trim()) return ack && ack({ ok:false, error:'Group name required' });
        groupName = groupName.trim();
        const g = groups.get(groupName);
        if (!g) return ack && ack({ ok:false, error:'Group not found' });
        if (!g.members.has(username)) return ack && ack({ ok:false, error:'Only members can delete' });
        groups.delete(groupName);
        for (const m of g.members) {
          const s = socketByUser.get(m); if (s) s.leave(groupRoom(groupName));
        }
        io.emit('groups:update', listGroups());
        ack && ack({ ok:true });
      });

      // Group message
      socket.on('group:message', (payload, ack) => {
        const username = userBySocket.get(socket.id);
        if (!username) return ack && ack({ ok:false, error:'Not registered' });
        const { groupName, text } = payload || {};
        if (!groupName || typeof text !== 'string' || !text.trim()) return ack && ack({ ok:false, error:'groupName and text required' });
        const g = groups.get(groupName);
        if (!g || !g.members.has(username)) return ack && ack({ ok:false, error:'Not a member' });
        const message = { room:groupRoom(groupName), groupName, type:'group', from:username, text:text.trim(), timestamp:Date.now() };
        io.to(groupRoom(groupName)).emit('group:message', message);
        if (mongoose.connection.readyState === 1) Message.create(message).catch(()=>{});
        ack && ack({ ok:true });
      });

      // Start DM
      socket.on('dm:start', (toUsername, ack) => {
        const fromUsername = userBySocket.get(socket.id);
        if (!fromUsername) return ack && ack({ ok:false, error:'Not registered' });
        if (!toUsername || !toUsername.trim()) return ack && ack({ ok:false, error:'Target username required' });
        toUsername = toUsername.trim();
        if (!socketByUser.has(toUsername)) return ack && ack({ ok:false, error:'Target user offline' });
        const room = dmRoom(fromUsername, toUsername);
        const targetSocket = socketByUser.get(toUsername);
        socket.join(room);
        targetSocket.join(room);
        const payload = { room, type:'dm', with:[fromUsername, toUsername].sort() };
        socket.emit('dm:ready', payload);
        targetSocket.emit('dm:ready', payload);
        ack && ack({ ok:true, room });
      });

      // DM message
      socket.on('dm:message', (payload, ack) => {
        const fromUsername = userBySocket.get(socket.id);
        if (!fromUsername) return ack && ack({ ok:false, error:'Not registered' });
        const { room, text } = payload || {};
        if (!room || typeof text !== 'string' || !text.trim()) return ack && ack({ ok:false, error:'room and text required' });
        const message = { room, type:'dm', from:fromUsername, text:text.trim(), timestamp:Date.now() };
        io.to(room).emit('dm:message', message);
        if (mongoose.connection.readyState === 1) Message.create(message).catch(()=>{});
        ack && ack({ ok:true });
      });

      // Users list utility
      socket.on('users:list', (ack) => ack && ack({ ok:true, users:listUsers() }));

      // Disconnect
      socket.on('disconnect', () => {
        const username = userBySocket.get(socket.id);
        if (username) {
          userBySocket.delete(socket.id);
          socketByUser.delete(username);
          for (const g of groups.values()) {
            // Keep owners as members so they retain ownership/membership on return
            if (g.members.has(username) && g.owner !== username) g.members.delete(username);
          }
          if (mongoose.connection.readyState === 1) User.updateOne({ username }, { $currentDate:{ lastSeenAt:true } }).exec().catch(()=>{});
          io.emit('users:update', listUsers());
          io.emit('groups:update', listGroups());
          console.log(`User disconnected: ${username} (${socket.id})`);
        } else {
          console.log('Socket disconnected:', socket.id);
        }
      });
    });

    // Optional legacy listen snippet kept commented below
    // const PORT = 4000;
    // server.listen(PORT, () => console.log(`Server running on port ${PORT}`));