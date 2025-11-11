/**
 * groupService
 * Provides a uniform API for group operations. When MongoDB is available it persists
 * groups using the Group model. Otherwise falls back to an in-memory Map implementation.
 */
const mongoose = require('mongoose');
let GroupModel = null;
try {
  GroupModel = require('../models/Group');
} catch (e) {
  /* not available */
}

// In-memory fallback
const groups = new Map();

const normalizeDbGroupToInternal = (doc) => {
  if (!doc) return null;
  return {
    name: doc.name,
    members: new Set(Array.isArray(doc.members) ? doc.members : []),
    owner: doc.owner,
    private: !!doc.private,
    pending: new Set(Array.isArray(doc.pending) ? doc.pending : []),
  };
};

const normalizeForClient = (g) => ({
  name: g.name,
  members: Array.from(g.members).sort(),
  owner: g.owner,
  private: !!g.private,
  pending: Array.from(g.pending || []).sort(),
});

const usingDb = () => mongoose.connection && mongoose.connection.readyState === 1 && GroupModel;

const listGroups = async () => {
  if (usingDb()) {
    const docs = await GroupModel.find({}).lean().exec();
    return docs.map((d) => ({
      name: d.name,
      members: (d.members || []).slice().sort(),
      owner: d.owner,
      private: !!d.private,
      pending: (d.pending || []).slice().sort(),
    }));
  }
  return Array.from(groups.values()).map(normalizeForClient);
};

module.exports = {
  createGroup: async (name, owner, isPrivate = false) => {
    if (usingDb()) {
      const existing = await GroupModel.findOne({ name }).lean().exec();
      if (existing) throw new Error('Group already exists');
      const created = await GroupModel.create({
        name,
        owner,
        members: [owner],
        private: !!isPrivate,
        pending: [],
      });
      return normalizeDbGroupToInternal(created);
    }
    if (groups.has(name)) throw new Error('Group already exists');
    const g = { name, members: new Set([owner]), owner, private: !!isPrivate, pending: new Set() };
    groups.set(name, g);
    return g;
  },
  getGroup: async (name) => {
    if (usingDb()) {
      const doc = await GroupModel.findOne({ name }).lean().exec();
      return normalizeDbGroupToInternal(doc);
    }
    return groups.get(name);
  },
  hasGroup: async (name) => {
    if (usingDb()) return !!(await GroupModel.findOne({ name }).lean().exec());
    return groups.has(name);
  },
  joinPublic: async (name, username) => {
    if (usingDb()) {
      const g = await GroupModel.findOne({ name }).exec();
      if (!g) throw new Error('Group not found');
      if (g.private) throw new Error('Group is private');
      if (!g.members.includes(username)) {
        g.members.push(username);
        await g.save();
      }
      return normalizeDbGroupToInternal(g);
    }
    const g = groups.get(name);
    if (!g) throw new Error('Group not found');
    if (g.private) throw new Error('Group is private');
    g.members.add(username);
    return g;
  },
  requestJoin: async (name, username) => {
    if (usingDb()) {
      const g = await GroupModel.findOne({ name }).exec();
      if (!g) throw new Error('Group not found');
      if (!g.private) throw new Error('Group is public');
      if (g.members.includes(username)) throw new Error('Already member');
      if (g.pending.includes(username)) throw new Error('Already requested');
      g.pending.push(username);
      await g.save();
      return normalizeDbGroupToInternal(g);
    }
    const g = groups.get(name);
    if (!g) throw new Error('Group not found');
    if (!g.private) throw new Error('Group is public');
    if (g.members.has(username)) throw new Error('Already member');
    if (g.pending.has(username)) throw new Error('Already requested');
    g.pending.add(username);
    return g;
  },
  approve: async (name, target) => {
    if (usingDb()) {
      const g = await GroupModel.findOne({ name }).exec();
      if (!g) throw new Error('Group not found');
      if (!g.pending.includes(target)) throw new Error('No pending request');
      g.pending = g.pending.filter((x) => x !== target);
      if (!g.members.includes(target)) g.members.push(target);
      await g.save();
      return normalizeDbGroupToInternal(g);
    }
    const g = groups.get(name);
    if (!g) throw new Error('Group not found');
    if (!g.pending.has(target)) throw new Error('No pending request');
    g.pending.delete(target);
    g.members.add(target);
    return g;
  },
  reject: async (name, target) => {
    if (usingDb()) {
      const g = await GroupModel.findOne({ name }).exec();
      if (!g) throw new Error('Group not found');
      if (!g.pending.includes(target)) throw new Error('No pending request');
      g.pending = g.pending.filter((x) => x !== target);
      await g.save();
      return normalizeDbGroupToInternal(g);
    }
    const g = groups.get(name);
    if (!g) throw new Error('Group not found');
    if (!g.pending.has(target)) throw new Error('No pending request');
    g.pending.delete(target);
    return g;
  },
  deleteGroup: async (name) => {
    if (usingDb()) {
      const doc = await GroupModel.findOneAndDelete({ name }).lean().exec();
      if (!doc) throw new Error('Group not found');
      return normalizeDbGroupToInternal(doc);
    }
    const g = groups.get(name);
    if (!g) throw new Error('Group not found');
    groups.delete(name);
    return g;
  },
  removeMember: async (name, username) => {
    if (usingDb()) {
      const g = await GroupModel.findOne({ name }).exec();
      if (!g) return;
      if (g.owner === username) return; // don't remove owner
      g.members = g.members.filter((m) => m !== username);
      await g.save();
      return;
    }
    const g = groups.get(name);
    if (!g) return;
    if (g.members.has(username) && g.owner !== username) g.members.delete(username);
  },
  listGroups,
  getRaw: async () => {
    // Return a Map-like object for compatibility with existing code which iterates entries()/values()
    if (usingDb()) {
      const docs = await GroupModel.find({}).lean().exec();
      const m = new Map();
      for (const d of docs) m.set(d.name, normalizeDbGroupToInternal(d));
      return m;
    }
    return groups;
  },
};
