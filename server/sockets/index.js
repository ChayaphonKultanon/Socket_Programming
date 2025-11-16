/**
 * Socket.IO handlers module.
 * Wires up connection events and delegates to services for presence, groups and messages.
 */
const presence = require('../services/presenceService');
const groups = require('../services/groupService');
const messages = require('../services/messageService');
const User = require('../models/User');

module.exports = function initSocketHandlers(io, opts = {}) {
  let worldChat = opts.worldChat;

  const listGroups = async () => await groups.listGroups();

  // Return groups list tailored for a specific user. Only the group owner will
  // see the `pending` requests for their group. Other users receive an empty
  // pending array so join requests aren't exposed.
  const listGroupsForUser = async (username) => {
    const arr = await listGroups();
    return arr.map((g) => ({
      name: g.name,
      members: g.members,
      owner: g.owner,
      private: !!g.private,
      pending: g.owner === username ? (g.pending || []) : [],
    }));
  };

  // Emit groups:update to every connected user with a tailored groups list
  // so only owners see pending join requests.
  const emitGroupsUpdateAll = async () => {
    try {
      const users = presence.listUsers();
      for (const u of users) {
        try {
          const sock = presence.getSocket(u);
          if (!sock) continue;
          const gl = await listGroupsForUser(u);
          sock.emit('groups:update', gl);
        } catch (e) {
          // ignore per-socket emit errors
        }
      }
    } catch (e) {
      // ignore
    }
  };

  const dmRoom = (u1, u2) => `dm:${[u1, u2].sort().join('|')}`;
  const groupRoom = (g) => `group:${g}`;

  // initialize worldChat service if not provided via opts
  if (!worldChat) {
    try {
      const initWorldChat = require('../services/worldChatService');
      worldChat = initWorldChat(io, presence);
    } catch (err) {
      // If worldChat service cannot be loaded, continue without it
      console.warn('worldChat service not available:', err && err.message);
    }
  }

  io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id);

    socket.on('register', async (username, ack) => {
      try {
        if (typeof username !== 'string' || !username.trim())
          return ack && ack({ ok: false, error: 'Username is required' });
        username = username.trim();
        if (presence.hasUser(username))
          return ack && ack({ ok: false, error: 'Username already taken' });

        presence.add(socket.id, username, socket);
        if (typeof User !== 'undefined') {
          User.findOneAndUpdate(
            { username },
            { $set: { username }, $currentDate: { lastSeenAt: true } },
            { upsert: true, new: true }
          )
            .exec()
            .catch(() => {});
        }

        io.emit('users:update', presence.listUsers());
        try {
          const gl = await listGroupsForUser(username);
          ack && ack({ ok: true, users: presence.listUsers(), groups: gl });
        } catch (err) {
          ack && ack({ ok: true, users: presence.listUsers(), groups: [] });
        }

        // auto-join group rooms for existing memberships
        try {
          const raw = await groups.getRaw();
          for (const g of raw.values()) {
            if (g.members && g.members.has && g.members.has(username))
              socket.join(groupRoom(g.name));
          }
        } catch (e) {
          // fallback to sync raw if available
          try {
            const raw2 = groups.getRaw();
            for (const g of raw2.values())
              if (g.members && g.members.has && g.members.has(username))
                socket.join(groupRoom(g.name));
          } catch (_) {}
        }

        // Load recent DM and group history for this user (if DB connected)
        try {
          const mongoose = require('mongoose');
          const MessageModel = require('../models/Message');
          if (mongoose.connection.readyState === 1 && MessageModel) {
            const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const dmRe = new RegExp(`^dm:(?:${esc(username)}\|.+|.+\|${esc(username)})$`);
            // group rooms where user is member
            const userGroupRooms = [];
            try {
              const raw = await groups.getRaw();
              for (const g of raw.values())
                if (g.members && g.members.has && g.members.has(username))
                  userGroupRooms.push(groupRoom(g.name));
            } catch (ee) {
              // fallback to sync raw (in-memory)
              try {
                const raw2 = groups.getRaw();
                for (const g of raw2.values())
                  if (g.members && g.members.has && g.members.has(username))
                    userGroupRooms.push(groupRoom(g.name));
              } catch (_) {}
            }

            const query = { $or: [] };
            query.$or.push({ type: 'dm', room: dmRe });
            if (userGroupRooms.length)
              query.$or.push({ type: 'group', room: { $in: userGroupRooms } });

            const msgs = await MessageModel.find(query)
              .sort({ timestamp: -1 })
              .limit(1000)
              .lean()
              .exec();
            const byRoom = {};
            for (const m of msgs.reverse()) {
              if (!byRoom[m.room]) byRoom[m.room] = [];
              byRoom[m.room].push({
                room: m.room,
                type: m.type,
                from: m.from,
                text: m.text,
                timestamp: m.timestamp,
                groupName: m.groupName,
              });
            }
            if (Object.keys(byRoom).length) socket.emit('history:load', byRoom);

            // compute unread counts per room using saved lastRead timestamps (DB or in-memory fallback)
            try {
              const UserModel = require('../models/User');
              const userDoc = await UserModel.findOne({ username }).lean().exec();
              const lastRead = (userDoc && userDoc.lastRead) || {};
              const unread = {};
              // for each room we loaded messages for, count messages after lastRead
              const MessageModel2 = require('../models/Message');
              for (const room of Object.keys(byRoom)) {
                const lastTs = lastRead && lastRead[room] ? new Date(lastRead[room]).getTime() : 0;
                const cnt = await MessageModel2.countDocuments({ room, timestamp: { $gt: lastTs }, from: { $ne: username } }).exec();
                if (cnt > 0) unread[room] = cnt;
              }
              if (Object.keys(unread).length) socket.emit('unread:update', unread);
            } catch (e) {
              // fallback: use presenceService in-memory lastRead map
              try {
                const lastMap = presence.getLastReadMap(username);
                const unread = {};
                for (const room of Object.keys(byRoom)) {
                  const lastTs = lastMap && lastMap.get ? (lastMap.get(room) || 0) : 0;
                  const arr = byRoom[room] || [];
                  const cnt = arr.filter((m) => m.timestamp > lastTs && m.from !== username).length;
                  if (cnt > 0) unread[room] = cnt;
                }
                if (Object.keys(unread).length) socket.emit('unread:update', unread);
              } catch (ee) {
                // ignore unread computation errors
              }
            }
          }
        } catch (e) {
          // don't block registration on history load failures
          console.warn('history load failed:', e && e.message);
        }
      } catch (e) {
        ack && ack({ ok: false, error: 'Register failed' });
      }
    });

    socket.on('groups:create', async (payload, ack) => {
      const username = presence.getUsername(socket.id);
      if (!username) return ack && ack({ ok: false, error: 'Not registered' });
      let groupName;
      let isPrivate = false;
      if (typeof payload === 'string') groupName = payload;
      else if (payload && typeof payload.name === 'string') {
        groupName = payload.name;
        isPrivate = !!payload.private;
      }
      if (!groupName || !groupName.trim())
        return ack && ack({ ok: false, error: 'Group name required' });
      groupName = groupName.trim();
      try {
        const g = await groups.createGroup(groupName, username, isPrivate);
        socket.join(groupRoom(groupName));
        try {
          await emitGroupsUpdateAll();
        } catch (_) {
          // best effort
        }
        ack &&
          ack({
            ok: true,
            group: { name: groupName, members: [username], owner: username, private: isPrivate },
          });
      } catch (err) {
        return ack && ack({ ok: false, error: err.message });
      }
    });

    socket.on('groups:join', async (groupName, ack) => {
      const username = presence.getUsername(socket.id);
      if (!username) return ack && ack({ ok: false, error: 'Not registered' });
      try {
        const g = await groups.getGroup(groupName);
        if (!g) return ack && ack({ ok: false, error: 'Group not found' });
        if (g.private) return ack && ack({ ok: false, error: 'Group is private; request instead' });
        await groups.joinPublic(groupName, username);
        socket.join(groupRoom(groupName));
        try {
          await emitGroupsUpdateAll();
        } catch (_) {}
        return (
          ack && ack({ ok: true, group: { name: g.name, members: Array.from(g.members || []) } })
        );
      } catch (e) {
        return ack && ack({ ok: false, error: e.message });
      }
    });

    socket.on('groups:requestJoin', async (groupName, ack) => {
      const username = presence.getUsername(socket.id);
      if (!username) return ack && ack({ ok: false, error: 'Not registered' });
      try {
        const g = await groups.requestJoin(groupName, username);
        const ownerSocket = presence.getSocket(g.owner);
        if (ownerSocket)
          ownerSocket.emit('groups:join:request', { groupName, requester: username });
        try {
          await emitGroupsUpdateAll();
        } catch (_) {}
        return ack && ack({ ok: true, pending: true });
      } catch (e) {
        return ack && ack({ ok: false, error: e.message });
      }
    });

    socket.on('groups:approve', async (payload, ack) => {
      const username = presence.getUsername(socket.id);
      if (!username) return ack && ack({ ok: false, error: 'Not registered' });
      const { groupName, username: target } = payload || {};
      try {
        const g = await groups.getGroup(groupName);
        if (!g) return ack && ack({ ok: false, error: 'Group not found' });
        if (g.owner !== username) return ack && ack({ ok: false, error: 'Only owner can approve' });
        await groups.approve(groupName, target);
        const targetSocket = presence.getSocket(target);
        if (targetSocket) targetSocket.join(groupRoom(groupName));
        try {
          await emitGroupsUpdateAll();
        } catch (_) {}
        if (targetSocket) targetSocket.emit('groups:approved', { groupName });
        return ack && ack({ ok: true });
      } catch (e) {
        return ack && ack({ ok: false, error: e.message });
      }
    });

    socket.on('groups:reject', async (payload, ack) => {
      const username = presence.getUsername(socket.id);
      if (!username) return ack && ack({ ok: false, error: 'Not registered' });
      const { groupName, username: target } = payload || {};
      try {
        const g = await groups.getGroup(groupName);
        if (!g) return ack && ack({ ok: false, error: 'Group not found' });
        if (g.owner !== username) return ack && ack({ ok: false, error: 'Only owner can reject' });
        await groups.reject(groupName, target);
        const targetSocket = presence.getSocket(target);
        if (targetSocket) targetSocket.emit('groups:rejected', { groupName });
        try {
          await emitGroupsUpdateAll();
        } catch (_) {}
        return ack && ack({ ok: true });
      } catch (e) {
        return ack && ack({ ok: false, error: e.message });
      }
    });

    socket.on('groups:delete', async (groupName, ack) => {
      const username = presence.getUsername(socket.id);
      if (!username) return ack && ack({ ok: false, error: 'Not registered' });
      if (!groupName || !groupName.trim())
        return ack && ack({ ok: false, error: 'Group name required' });
      try {
        const g = await groups.getGroup(groupName);
        if (!g) return ack && ack({ ok: false, error: 'Group not found' });
        if (!g.members.has(username))
          return ack && ack({ ok: false, error: 'Only members can delete' });
        const deleted = await groups.deleteGroup(groupName);
        for (const m of deleted.members) {
          const s = presence.getSocket(m);
          if (s) s.leave(groupRoom(groupName));
        }
        try {
          await emitGroupsUpdateAll();
        } catch (_) {}
        return ack && ack({ ok: true });
      } catch (e) {
        return ack && ack({ ok: false, error: e.message });
      }
    });

    socket.on('group:message', async (payload, ack) => {
      const username = presence.getUsername(socket.id);
      if (!username) return ack && ack({ ok: false, error: 'Not registered' });
      const { groupName, text } = payload || {};
      if (!groupName || typeof text !== 'string' || !text.trim())
        return ack && ack({ ok: false, error: 'groupName and text required' });
      const g = await groups.getGroup(groupName);
      if (!g || !g.members.has(username)) return ack && ack({ ok: false, error: 'Not a member' });
      const message = {
        room: groupRoom(groupName),
        groupName,
        type: 'group',
        from: username,
        text: text.trim(),
        timestamp: Date.now(),
      };
      io.to(groupRoom(groupName)).emit('group:message', message);
      await messages.save(message);
      return ack && ack({ ok: true });
    });

    socket.on('dm:start', (toUsername, ack) => {
      const fromUsername = presence.getUsername(socket.id);
      if (!fromUsername) return ack && ack({ ok: false, error: 'Not registered' });
      if (!toUsername || !toUsername.trim())
        return ack && ack({ ok: false, error: 'Target username required' });
      toUsername = toUsername.trim();
      if (!presence.hasUser(toUsername))
        return ack && ack({ ok: false, error: 'Target user offline' });
      const room = dmRoom(fromUsername, toUsername);
      const targetSocket = presence.getSocket(toUsername);
      socket.join(room);
      if (targetSocket) targetSocket.join(room);
      const payload = { room, type: 'dm', with: [fromUsername, toUsername].sort() };
      socket.emit('dm:ready', payload);
      if (targetSocket) targetSocket.emit('dm:ready', payload);
      return ack && ack({ ok: true, room });
    });

    socket.on('dm:message', async (payload, ack) => {
      const fromUsername = presence.getUsername(socket.id);
      if (!fromUsername) return ack && ack({ ok: false, error: 'Not registered' });
      const { room, text } = payload || {};
      if (!room || typeof text !== 'string' || !text.trim())
        return ack && ack({ ok: false, error: 'room and text required' });
      const message = {
        room,
        type: 'dm',
        from: fromUsername,
        text: text.trim(),
        timestamp: Date.now(),
      };
      io.to(room).emit('dm:message', message);
      await messages.save(message);
      return ack && ack({ ok: true });
    });

    socket.on('users:list', (ack) => ack && ack({ ok: true, users: presence.listUsers() }));

    // mark one or more rooms as read for this user (persist last-read timestamp)
    socket.on('rooms:read', async (rooms, ack) => {
      const username = presence.getUsername(socket.id);
      if (!username) return ack && ack({ ok: false, error: 'Not registered' });
      try {
        const roomList = [];
        if (!rooms) return ack && ack({ ok: false, error: 'No room specified' });
        if (Array.isArray(rooms)) roomList.push(...rooms);
        else if (typeof rooms === 'string') roomList.push(rooms);
        else return ack && ack({ ok: false, error: 'Invalid rooms payload' });

        const ts = new Date();
        // persist to DB if available
        try {
          const mongoose = require('mongoose');
          const UserModel = require('../models/User');
          if (mongoose.connection.readyState === 1 && UserModel) {
            const setObj = {};
            for (const r of roomList) {
              setObj[`lastRead.${r}`] = ts;
            }
            await UserModel.updateOne({ username }, { $set: setObj }, { upsert: true }).exec();
          }
        } catch (e) {
          // ignore DB errors
        }

        // update in-memory fallback
        try {
          for (const r of roomList) presence.setLastRead(username, r, ts.getTime());
        } catch (e) {
          /* ignore */
        }

        return ack && ack({ ok: true });
      } catch (e) {
        return ack && ack({ ok: false, error: 'Failed to mark read' });
      }
    });

    socket.on('groups:list', async (ack) => {
      if (!ack) return;
      try {
        const username = presence.getUsername(socket.id);
        const gl = username ? await listGroupsForUser(username) : await listGroups();
        ack({ ok: true, groups: gl });
      } catch (e) {
        ack({ ok: true, groups: [] });
      }
    });

    socket.on('disconnect', async () => {
      const username = presence.removeBySocket(socket.id);
      if (username) {
        // Do NOT modify group membership on disconnect. Members remain members even when offline.
        // Just update presence/lastSeen and notify clients of updated presence/groups state.
        if (typeof User !== 'undefined')
          User.updateOne({ username }, { $currentDate: { lastSeenAt: true } })
            .exec()
            .catch(() => {});
        io.emit('users:update', presence.listUsers());
        try {
          await emitGroupsUpdateAll();
        } catch (_) {}
        console.log(`User disconnected: ${username} (${socket.id})`);
      } else {
        console.log('Socket disconnected:', socket.id);
      }
    });
  });
};
