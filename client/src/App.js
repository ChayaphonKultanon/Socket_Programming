import React, { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import './App.css';
import './WorldChat.css';
import WorldChat from './WorldChat';
import logo from './network_logo.jpg';
import NotificationService from './notifications/notificationService';
import Notifications from './components/Notifications';
import UnreadLogo from './components/UnreadLogo';
import Avatar from './components/Avatar';

// If you need to override the server URL (different host/port), set REACT_APP_SERVER_URL in the client env.
// const serverURL = process.env.REACT_APP_SERVER_URL || window.location.origin;
const serverURL = "http://localhost:4000";
// const serverURL = "http://172.20.10.3:4000";

function App() {
  // Create a single socket instance (avoids duplicate connections in StrictMode)
  const [socketInstance] = useState(() => io(serverURL));

  // Theme: light | dark (persisted in localStorage)
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('theme') || 'light';
    } catch (e) {
      return 'light';
    }
  });

  // Auth / presence
  const [username, setUsername] = useState('');
  const [you, setYou] = useState('');
  const [registered, setRegistered] = useState(false);
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [error, setError] = useState('');

  // Conversations state: roomId -> [{from, text, timestamp, type, groupName?}]
  const [messagesByRoom, setMessagesByRoom] = useState({});
  // Active chat selection
  const [active, setActive] = useState(null); // { kind: 'dm'|'group', room, label, groupName? }
  // unread counts per room
  const [unread, setUnread] = useState({});
  // Hovered group popup state: { name, x, y }
  const [hoveredGroup, setHoveredGroup] = useState(null);

  const dmRoomId = (a, b) => {
    try {
      return `dm:${[a, b].sort().join('|')}`;
    } catch (e) {
      return null;
    }
  };

  useEffect(() => {
    try {
      document.documentElement.setAttribute('data-theme', theme);
    } catch (e) {}
    try {
      localStorage.setItem('theme', theme);
    } catch (e) {}
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === 'light' ? 'dark' : 'light'));

  // Register and subscriptions
  useEffect(() => {
    const onUsersUpdate = (list) => setUsers(list || []);
    const onGroupsUpdate = (list) => setGroups(list || []);
    const onHistoryLoad = (byRoom) => {
      if (!byRoom || typeof byRoom !== 'object') return;
      setMessagesByRoom((prev) => {
        const next = { ...prev };
        Object.entries(byRoom).forEach(([room, arr]) => {
          next[room] = [...(prev[room] || []), ...(arr || [])];
        });
        return next;
      });
    };

    const onUnreadUpdate = (byRoom) => {
      if (!byRoom || typeof byRoom !== 'object') return;
      setUnread((prev) => ({ ...prev, ...byRoom }));
    };

    const onGroupDeleted = (groupName) => {
      try {
        const roomId = `group:${groupName}`;
        setMessagesByRoom((prev) => {
          const next = { ...prev };
          if (next[roomId]) delete next[roomId];
          return next;
        });
        setUnread((prev) => {
          const next = { ...prev };
          if (next[roomId]) delete next[roomId];
          return next;
        });
        setActive((prev) => (prev && prev.kind === 'group' && prev.groupName === groupName ? null : prev));
      } catch (e) {
        /* ignore */
      }
    };

    const onDmReady = (payload) => {
      // payload: { room, type: 'dm', with: [a,b] }
      // Ensure messages state exists
      setMessagesByRoom((prev) => ({ ...prev, [payload.room]: prev[payload.room] || [] }));
      // If no active chat, auto-select this DM
      if (!active) {
        const other = (payload.with || []).find((u) => u !== you) || payload.with?.[0];
        setActive({ kind: 'dm', room: payload.room, label: `${other}` });
      }
    };

    const onDmMessage = (msg) => {
      setMessagesByRoom((prev) => ({
        ...prev,
        [msg.room]: [...(prev[msg.room] || []), msg],
      }));
      // increment unread if not viewing this room and not our own message
      if (msg.from !== you && (!active || active.room !== msg.room)) {
        setUnread((prev) => ({ ...prev, [msg.room]: (prev[msg.room] || 0) + 1 }));
      }
      // show in-app notification unless user is viewing this room
      try {
        if (!active || active.room !== msg.room) {
          NotificationService.notify({
            title: msg.from + (msg.type === 'group' ? ` @ ${msg.groupName}` : ' (DM)'),
            body: msg.text,
            room: msg.room,
            type: msg.type,
          });
        }
      } catch (e) {
        console.error('notify dm message failed', e, msg);
      }
    };

    const onGroupMessage = (msg) => {
      setMessagesByRoom((prev) => ({
        ...prev,
        [msg.room]: [...(prev[msg.room] || []), msg],
      }));
      // increment unread if not viewing this room and not our own message
      if (msg.from !== you && (!active || active.room !== msg.room)) {
        setUnread((prev) => ({ ...prev, [msg.room]: (prev[msg.room] || 0) + 1 }));
      }
      // show in-app notification unless user is viewing this room
      try {
        if (!active || active.room !== msg.room) {
          NotificationService.notify({
            title: msg.from + (msg.groupName ? ` @ ${msg.groupName}` : ''),
            body: msg.text,
            room: msg.room,
            type: msg.type,
          });
        }
      } catch (e) {
        console.error('notify group message failed', e, msg);
      }
    };

    socketInstance.on('users:update', onUsersUpdate);
    socketInstance.on('groups:update', onGroupsUpdate);
    const onJoinRequest = (payload) => {
      // payload: { groupName, requester }
      setGroupRequestMsg(`Join request from ${payload.requester} for ${payload.groupName}`);
    };
    const onApproved = (payload) => {
      setGroupRequestMsg(`Your request to join ${payload.groupName} was approved`);
    };
    const onRejected = (payload) => {
      setGroupRequestMsg(`Your request to join ${payload.groupName} was rejected`);
    };
    socketInstance.on('groups:join:request', onJoinRequest);
    socketInstance.on('groups:approved', onApproved);
    socketInstance.on('groups:rejected', onRejected);
    socketInstance.on('dm:ready', onDmReady);
    socketInstance.on('dm:message', onDmMessage);
    socketInstance.on('group:message', onGroupMessage);
    socketInstance.on('groups:deleted', onGroupDeleted);
    socketInstance.on('history:load', onHistoryLoad);
    socketInstance.on('unread:update', onUnreadUpdate);

    return () => {
      socketInstance.off('users:update', onUsersUpdate);
      socketInstance.off('groups:update', onGroupsUpdate);
      socketInstance.off('dm:ready', onDmReady);
      socketInstance.off('dm:message', onDmMessage);
      socketInstance.off('group:message', onGroupMessage);
      socketInstance.off('groups:deleted', onGroupDeleted);
      socketInstance.off('groups:join:request', onJoinRequest);
      socketInstance.off('groups:approved', onApproved);
      socketInstance.off('groups:rejected', onRejected);
      socketInstance.off('history:load', onHistoryLoad);
      socketInstance.off('unread:update', onUnreadUpdate);
    };
  }, [socketInstance, active, you]);

  // When user opens a chat, clear unread for that room
  useEffect(() => {
    if (!active) return;
    try {
      setUnread((prev) => ({ ...prev, [active.room]: 0 }));
    } catch (e) {
      /* ignore */
    }
  }, [active]);

  // Persist read state when user navigates away or tab becomes hidden
  useEffect(() => {
    const emitRead = () => {
      try {
        if (!socketInstance || !you || !active || !active.room) return;
        socketInstance.emit('rooms:read', active.room);
      } catch (e) {
        // ignore
      }
    };

    const onBeforeUnload = () => emitRead();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') emitRead();
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      // emit once more on cleanup
      emitRead();
    };
  }, [socketInstance, active, you]);

  const doRegister = () => {
    setError('');
    const name = username.trim();
    if (!name) return setError('Please enter a username');
    socketInstance.emit('register', name, (res) => {
      if (!res?.ok) return setError(res?.error || 'Register failed');
      setRegistered(true);
      setYou(name);
      setUsers(res.users || []);
      setGroups(res.groups || []);
    });
  };

  const startDM = (toUsername) => {
    setError('');
    if (toUsername === you) return; // ignore self
    socketInstance.emit('dm:start', toUsername, (res) => {
      if (!res?.ok) return setError(res?.error || 'DM start failed');
      // Select this DM
      setActive({ kind: 'dm', room: res.room, label: `${toUsername}` });
      // mark as read on server
      try {
        socketInstance.emit('rooms:read', res.room);
      } catch (e) {}
      // clear unread for this room when opening
      setUnread((prev) => ({ ...prev, [res.room]: 0 }));
    });
  };

  const [groupName, setGroupName] = useState('');
  const [groupPrivate, setGroupPrivate] = useState(false);
  const [groupRequestMsg, setGroupRequestMsg] = useState('');
  const createGroup = () => {
    setError('');
    const g = groupName.trim();
    if (!g) return setError('Group name is required');
    socketInstance.emit('groups:create', { name: g, private: groupPrivate }, (res) => {
      if (!res?.ok) return setError(res?.error || 'Create group failed');
      setGroupName('');
      const roomId = `group:${g}`;
      setActive({ kind: 'group', room: roomId, label: `${g}`, groupName: g });
      // mark as read on server
      try {
        socketInstance.emit('rooms:read', roomId);
      } catch (e) {}
      setUnread((prev) => ({ ...prev, [roomId]: 0 }));
    });
  };

  const joinGroup = (gname) => {
    setError('');
    setGroupRequestMsg('');
    const g = groups.find((x) => x.name === gname);
    if (g && g.private) {
      // send join request
      socketInstance.emit('groups:requestJoin', gname, (res) => {
        if (!res?.ok) return setError(res?.error || 'Request failed');
        setGroupRequestMsg('Request sent');
      });
      return;
    }
    socketInstance.emit('groups:join', gname, (res) => {
      if (!res?.ok) return setError(res?.error || 'Join group failed');
      setActive({
        kind: 'group',
        room: `group:${gname}`,
        label: `${gname}`,
        groupName: gname,
      });
      setUnread((prev) => ({ ...prev, [`group:${gname}`]: 0 }));
    });
  };

  const deleteGroup = (gname) => {
    setError('');
    if (!window.confirm(`Delete group "${gname}"? This will remove the group for everyone.`))
      return;
    socketInstance.emit('groups:delete', gname, (res) => {
      if (!res?.ok) return setError(res?.error || 'Delete group failed');
      // If the deleted group was active, clear active
      if (active?.groupName === gname) setActive(null);
    });
  };

  const [text, setText] = useState('');
  // Separate state for the inline world chat input so it doesn't share the main chat input
  const [worldText, setWorldText] = useState('');
  const worldInputRef = useRef(null);

  // autofocus the world input on mount
  useEffect(() => {
    if (worldInputRef.current) {
      try {
        worldInputRef.current.focus();
      } catch (e) {
        /* ignore */
      }
    }
  }, []);
  const sendMessage = () => {
    setError('');
    const t = text.trim();
    if (!active) return setError('Select a chat first');
    if (!t) return; // ignore empty

    if (active && active.kind === 'world') {
      socketInstance.emit('world:message', { text: t }, (res) => {
        if (!res?.ok) return setError(res?.error || 'Send failed');
        setText('');
      });
    } else if (active.kind === 'dm') {
      socketInstance.emit('dm:message', { room: active.room, text: t }, (res) => {
        if (!res?.ok) return setError(res?.error || 'Send failed');
        setText('');
      });
    } else if (active.kind === 'group') {
      socketInstance.emit('group:message', { groupName: active.groupName, text: t }, (res) => {
        if (!res?.ok) return setError(res?.error || 'Send failed');
        setText('');
      });
    }
  };

  const sendWorldMessage = () => {
    setError('');
    const t = worldText.trim();
    if (!you) return setError('Join to send messages');
    if (!t) return; // ignore empty
    socketInstance.emit('world:message', { text: t }, (res) => {
      if (!res?.ok) return setError(res?.error || 'Send failed');
      setWorldText('');
    });
  };

  const renderLogin = () => (
    <div className="login-wrap">
      <div className="login-card">
        <div style={{ position: 'absolute', right: 12, top: 12 }}>
          <button
            className="btn btn-small"
            onClick={toggleTheme}
            title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
          >
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
        </div>
        <img src={logo} alt="logo" className="login-logo" />
        <h2 className="ink" style={{ marginTop: 0 }}>Si Yod Kuman Thahan Kla</h2>
        <p className="muted">Pick a unique name to join the chat.</p>
        <div className="stack">
          <input
            className="input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter unique username"
            onKeyDown={(e) => e.key === 'Enter' && doRegister()}
          />
          <button className="btn" onClick={doRegister}>
            Join
          </button>
        </div>
        {error && <p style={{ color: 'crimson' }}>{error}</p>}
      </div>
    </div>
  );

  const isMember = (g) => (g?.members || []).includes(you);

  const renderMain = () => (
    <div className="app-shell">
      <aside className="sidebar" style={{ overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <h3 className="hello">Hi, {you}</h3>
          <div>
            <button
              className="btn btn-small"
              onClick={toggleTheme}
              title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
            >
              {theme === 'light' ? '🌙 Dark' : '☀️ Light'}
            </button>
          </div>
        </div>
        <section className="section">
          {/* Inline world chat panel inside sidebar */}
          <div className="world-inline-panel">
            <div className="world-inline-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <strong>World Chat</strong>
              </div>
            </div>
            <div className="world-inline-body">
              <WorldChat socket={socketInstance} username={you} />
            </div>
            <div className="world-inline-footer" style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <input
                ref={worldInputRef}
                className="input"
                value={worldText}
                onChange={(e) => setWorldText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendWorldMessage()}
                placeholder={you ? 'Message world chat' : 'Join to send messages'}
                disabled={!you}
                style={{ flex: '1 1 200px', minWidth: 0 }}
              />
              <button
                className="btn"
                onClick={sendWorldMessage}
                disabled={!you || !worldText.trim()}
              >
                Send
              </button>
            </div>
          </div>

          <h4>Online users</h4>
          <ul className="list">
            {users.map((u) => {
              const roomForU = dmRoomId(you, u);
              const count = roomForU ? unread[roomForU] || 0 : 0;
              return (
                <li key={u} className="user-item">
                  <Avatar name={u} size={36} />
                  <span className="user-name-wrap">
                    <span>
                      {u}
                      {u === you ? ' (you)' : ''}
                    </span>
                    {/* unread badge behind name */}
                    {u !== you && count > 0 && (
                      <span className="unread-badge">
                          <UnreadLogo size={20} count={count} onlyBadge={true} />
                      </span>
                    )}
                  </span>
                  {u !== you && (
                    <button
                      className="btn btn-small"
                      onClick={() => {
                        startDM(u);
                        // clear unread for this dm if exists
                        if (roomForU) setUnread((prev) => ({ ...prev, [roomForU]: 0 }));
                      }}
                    >
                      DM
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
        <section className="section">
          <h4>Groups</h4>
          {groupRequestMsg && (
            <div style={{ marginBottom: 8, color: 'var(--success)', fontSize: 13 }}>{groupRequestMsg}</div>
          )}
          <div className="group-form" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              className="input"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="New group name"
              onKeyDown={(e) => e.key === 'Enter' && createGroup()}
              style={{ width: '90%', maxWidth: 300 }}
            />
            <div
              style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}
            >
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={groupPrivate}
                  onChange={(e) => setGroupPrivate(e.target.checked)}
                />{' '}
                Private
              </label>
              <button className="btn" onClick={createGroup}>
                Create
              </button>
            </div>
          </div>
          <ul className="list">
            {groups.map((g) => {
              const room = `group:${g.name}`;
              const count = unread[room] || 0;
              return (
                <li
                  key={g.name}
                  className="group-item"
                  onMouseEnter={(e) => {
                    try {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setHoveredGroup({
                        name: g.name,
                        x: Math.min(rect.left, window.innerWidth - 240),
                        y: rect.top + window.scrollY + rect.height + 4,
                      });
                    } catch (err) {
                      /* ignore */
                    }
                  }}
                  onMouseLeave={() => {
                    setHoveredGroup((prev) => (prev && prev.name === g.name ? null : prev));
                  }}
                >
                  <Avatar name={g.name} size={36} />
                  <strong className="group-name-wrap">
                      {g.name}
                      {g.private ? ' 🔒' : ''}
                      {/* Only show unread badge for members */}
                      {isMember(g) && count > 0 && (
                        <span className="group-unread-badge">
                          <UnreadLogo size={20} count={count} onlyBadge={true} />
                        </span>
                      )}
                      {/* Show pending requests inline after group name (not below) */}
                      {g.pending && g.pending.length > 0 && (
                        <span className="group-pending-note"> — {g.pending.length} pending request{g.pending.length > 1 ? 's' : ''}</span>
                      )}
                  </strong>
                    {/* Remove below-group pending note */}
                  {isMember(g) ? (
                    <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                      <button
                        className="btn btn-small"
                        onClick={() => {
                          const roomId = `group:${g.name}`;
                          setActive({
                            kind: 'group',
                            room: roomId,
                            label: `${g.name}`,
                            groupName: g.name,
                          });
                          try {
                            socketInstance.emit('rooms:read', roomId);
                          } catch (e) {}
                          setUnread((prev) => ({ ...prev, [roomId]: 0 }));
                        }}
                      >
                        Open
                      </button>
                      <button className="btn btn-small" onClick={() => deleteGroup(g.name)}>
                        Delete
                      </button>
                    </div>
                  ) : (
                    <button className="btn btn-small" onClick={() => joinGroup(g.name)}>
                      {g.private ? 'Request to join' : 'Join'}
                    </button>
                  )}
                  {/* Remove duplicate/behind pending notification */}
                </li>
              );
            })}
          </ul>
          {/* <p className="muted" style={{ marginTop: 8 }}>
            Members of selected group appear inside the group’s page.
          </p> */}
        </section>
        {error && <p style={{ color: 'crimson', marginTop: 8 }}>{error}</p>}
      </aside>

      <main className="main">
        <div className="chat-container">
          <div className="private-chat">
            <header className="chat-header">
              <h3 className="chat-title">{active ? active.label : 'Select a chat'}</h3>
              {active && active.kind === 'group' && (
                <div className="members-row">
                  {(groups.find((g) => g.name === active.groupName)?.members || []).map((m) => (
                    <span key={m} className={`chip ${m === you ? 'me' : ''}`}>
                      {m}
                    </span>
                  ))}
                  {/* If you're the owner, show pending join requests with approve/reject */}
                  {(() => {
                    const g = groups.find((x) => x.name === active.groupName);
                    if (g && g.owner === you && g.pending && g.pending.length) {
                      return (
                        <div
                          style={{ marginLeft: 12, display: 'flex', gap: 8, alignItems: 'center' }}
                        >
                          <strong style={{ fontSize: 12 }}>Pending:</strong>
                          {g.pending.map((p) => (
                            <span
                              key={p}
                              style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}
                            >
                              <span className="chip">{p}</span>
                              <button
                                className="btn btn-small"
                                onClick={() => {
                                  socketInstance.emit(
                                    'groups:approve',
                                    { groupName: g.name, username: p },
                                    (res) => {
                                      if (!res?.ok) setError(res?.error || 'Approve failed');
                                    }
                                  );
                                }}
                              >
                                Approve
                              </button>
                              <button
                                className="btn btn-small"
                                onClick={() => {
                                  socketInstance.emit(
                                    'groups:reject',
                                    { groupName: g.name, username: p },
                                    (res) => {
                                      if (!res?.ok) setError(res?.error || 'Reject failed');
                                    }
                                  );
                                }}
                              >
                                Reject
                              </button>
                            </span>
                          ))}
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
              )}
            </header>
            <div className="chat-content">
              {active ? (
                <div>
                  {(messagesByRoom[active.room] || []).map((m, i) => (
                    <div key={i} className={`message ${m.from === you ? 'me' : ''}`}>
                      <div className="meta">
                        <strong>{m.from}</strong> • {new Date(m.timestamp).toLocaleTimeString()}
                      </div>
                      <div>{m.text}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">Pick a user or group to start chatting.</p>
              )}
            </div>
          </div>

          {/* world chat removed from the main columns - it's accessible via the left tab */}
        </div>

        <footer className="chat-footer">
          <div className="stack">
            <input
              className="input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
              placeholder={active ? 'Type a message' : 'Select a chat to start'}
              disabled={!active}
            />
            <button className="btn" onClick={sendMessage} disabled={!active}>
              Send
            </button>
          </div>
        </footer>
      </main>
      {hoveredGroup && (
        <div
          className="group-members-popup"
          style={{ top: hoveredGroup.y, left: hoveredGroup.x }}
          onMouseLeave={() => setHoveredGroup(null)}
        >
          <div className="popup-title">Members: {hoveredGroup.name}</div>
          <ul className="popup-members">
            {(groups.find((gg) => gg.name === hoveredGroup.name)?.members || []).map((m) => (
              <li key={m} className={m === you ? 'me' : ''}>{m}</li>
            ))}
          </ul>
          {(() => {
            const g = groups.find((x) => x.name === hoveredGroup.name);
            if (g && g.pending && g.pending.length && g.owner === you) {
              return (
                <div className="popup-pending">
                  <div className="popup-subtitle">Pending requests:</div>
                  <ul>
                    {g.pending.map((p) => (
                      <li key={p}>
                        <span>{p}</span>
                        <button
                          className="btn btn-small"
                          onClick={() => {
                            socketInstance.emit(
                              'groups:approve',
                              { groupName: g.name, username: p },
                              (res) => {
                                if (!res?.ok) setError(res?.error || 'Approve failed');
                              }
                            );
                          }}
                        >
                          ✓
                        </button>
                        <button
                          className="btn btn-small"
                          onClick={() => {
                            socketInstance.emit(
                              'groups:reject',
                              { groupName: g.name, username: p },
                              (res) => {
                                if (!res?.ok) setError(res?.error || 'Reject failed');
                              }
                            );
                          }}
                          style={{ marginLeft: 4 }}
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            }
            return null;
          })()}
        </div>
      )}
      {/* Notifications layer (bottom-left) */}
      <Notifications
        onOpen={(room, type) => {
          try {
            if (type === 'group') {
              const gname = room.replace(/^group:/, '');
              setActive({ kind: 'group', room, label: `${gname}`, groupName: gname });
            } else {
              setActive({ kind: 'dm', room, label: `DM` });
            }
          } catch (e) {
            /* ignore */
          }
        }}
      />
    </div>
  );

  return registered ? renderMain() : renderLogin();
}

export default App;
