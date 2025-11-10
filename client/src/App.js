import React, { useEffect, useState } from "react";
import useSocket from "./hooks/useSocket";
import "./App.css";
import UnreadLogo from "./components/UnreadLogo";

const serverURL =
  process.env.REACT_APP_SERVER_URL ||
  `${window.location.protocol}//${window.location.hostname}:4000`;

function App() {
  // Create a single socket instance (via hook)
  const socketInstance = useSocket(serverURL);

  // Auth / presence
  const [username, setUsername] = useState("");
  const [you, setYou] = useState("");
  const [registered, setRegistered] = useState(false);
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [error, setError] = useState("");

  // Conversations state: roomId -> [{from, text, timestamp, type, groupName?}]
  const [messagesByRoom, setMessagesByRoom] = useState({});
  // Active chat selection
  const [active, setActive] = useState(null); // { kind: 'dm'|'group', room, label, groupName? }
  // In-app toasts for new messages (bottom-right)
  const [toasts, setToasts] = useState([]); // { id, title, body, room, type, timestamp }
  // Track unread messages per room
  const [unread, setUnread] = useState({}); // { roomId: count }
  // Map DM partner username -> room id so we can show unread per-user
  const [dmRooms, setDmRooms] = useState({}); // { username: roomId }

  // Register and subscriptions
  useEffect(() => {
    // Helper: show browser notification for an incoming message and in-app toast
    const removeToast = (id) => setToasts((prev) => prev.filter((t) => t.id !== id));

    const pushToast = (msg) => {
      if (!msg || msg.from === you) return;
      // If user is focused and viewing same room, skip toast
      if (document.hasFocus() && active && active.room === msg.room) return;
      const id = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
      const title = msg.type === "group" ? `${msg.from} @ ${msg.groupName}` : `${msg.from} (DM)`;
      const toast = { id, title, body: msg.text, room: msg.room, type: msg.type, timestamp: msg.timestamp };
      setToasts((prev) => [toast, ...prev]);
      // auto-dismiss
      setTimeout(() => removeToast(id), 4200);
    };

    const showNotification = (msg) => {
      try {
        // Always show in-app toast (unless it's your own message or you're viewing it)
        pushToast(msg);
      } catch (e) {
        // ignore
      }

      try {
        if (typeof Notification === "undefined") return;
        if (Notification.permission !== "granted") return;
        if (!msg || msg.from === you) return; // don't notify for your own messages
        // If user is focused and viewing same room, skip browser notification
        if (document.hasFocus() && active && active.room === msg.room) return;

        const title = msg.type === "group" ? `${msg.from} @ ${msg.groupName}` : `${msg.from} (DM)`;
        const options = {
          body: msg.text,
          tag: msg.room,
          timestamp: msg.timestamp,
        };
        const n = new Notification(title, options);
        n.onclick = () => {
          try {
            window.focus();
            if (msg.type === "group") {
              setActive({ kind: "group", room: msg.room, label: `Group: ${msg.groupName}`, groupName: msg.groupName });
            } else {
              setActive({ kind: "dm", room: msg.room, label: `DM with ${msg.from}` });
            }
            n.close();
          } catch (e) {
            // ignore
          }
        };
      } catch (e) {
        // Notification failed silently
      }
    };

    const onUsersUpdate = (list) => setUsers(list || []);
    const onGroupsUpdate = (list) => setGroups(list || []);

    const onDmReady = (payload) => {
      // payload: { room, type: 'dm', with: [a,b] }
      // Ensure messages state exists
      setMessagesByRoom((prev) => ({ ...prev, [payload.room]: prev[payload.room] || [] }));
      // If no active chat, auto-select this DM
      // remember which room belongs to which partner username
      const other = (payload.with || []).find((u) => u !== you) || payload.with?.[0];
      if (other) {
        setDmRooms((prev) => ({ ...prev, [other]: payload.room }));
      }
      if (!active) {
        setActive({ kind: "dm", room: payload.room, label: `DM with ${other}` });
      }
    };

    const onDmMessage = (msg) => {
      setMessagesByRoom((prev) => ({
        ...prev,
        [msg.room]: [...(prev[msg.room] || []), msg],
      }));
      // Increment unread count if not viewing this chat
      if ((!active || active.room !== msg.room) && msg.from !== you) {
        setUnread(prev => ({
          ...prev,
          [msg.room]: (prev[msg.room] || 0) + 1
        }));
      }
      showNotification(msg);
    };

    const onGroupMessage = (msg) => {
      setMessagesByRoom((prev) => ({
        ...prev,
        [msg.room]: [...(prev[msg.room] || []), msg],
      }));
      // Increment unread count if not viewing this chat
      if ((!active || active.room !== msg.room) && msg.from !== you) {
        setUnread(prev => ({
          ...prev,
          [msg.room]: (prev[msg.room] || 0) + 1
        }));
      }
      showNotification(msg);
    };

    if (!socketInstance) return;

    socketInstance.on("users:update", onUsersUpdate);
    socketInstance.on("groups:update", onGroupsUpdate);
    socketInstance.on("dm:ready", onDmReady);
    socketInstance.on("dm:message", onDmMessage);
    socketInstance.on("group:message", onGroupMessage);

    return () => {
      if (!socketInstance) return;
      socketInstance.off("users:update", onUsersUpdate);
      socketInstance.off("groups:update", onGroupsUpdate);
      socketInstance.off("dm:ready", onDmReady);
      socketInstance.off("dm:message", onDmMessage);
      socketInstance.off("group:message", onGroupMessage);
    };
  }, [socketInstance, active, you]);

  // Request browser notification permission once user registers
  useEffect(() => {
    try {
      if (!registered) return;
      if (typeof Notification === "undefined") return;
      if (Notification.permission === "default") {
        Notification.requestPermission();
      }
    } catch (e) {
      // ignore
    }
  }, [registered]);

  const doRegister = () => {
    setError("");
    const name = username.trim();
    if (!name) return setError("Please enter a username");
    if (!socketInstance) return setError("Not connected to server");
    socketInstance.emit("register", name, (res) => {
      if (!res?.ok) return setError(res?.error || "Register failed");
      setRegistered(true);
      setYou(name);
      setUsers(res.users || []);
      setGroups(res.groups || []);
    });
  };

  const startDM = (toUsername) => {
    setError("");
    if (toUsername === you) return; // ignore self
    if (!socketInstance) return setError("Not connected to server");
    socketInstance.emit("dm:start", toUsername, (res) => {
      if (!res?.ok) return setError(res?.error || "DM start failed");
      // Select this DM
      setActive({ kind: "dm", room: res.room, label: `DM with ${toUsername}` });
      // remember mapping username -> room so we can show per-user unread counts
      setDmRooms((prev) => ({ ...prev, [toUsername]: res.room }));
      // clear unread for this room when opening
      setUnread((prev) => ({ ...prev, [res.room]: 0 }));
    });
  };

  const [groupName, setGroupName] = useState("");
  const createGroup = () => {
    setError("");
    const g = groupName.trim();
    if (!g) return setError("Group name is required");
    if (!socketInstance) return setError("Not connected to server");
    socketInstance.emit("groups:create", g, (res) => {
      if (!res?.ok) return setError(res?.error || "Create group failed");
      setGroupName("");
      setActive({ kind: "group", room: `group:${g}`, label: `Group: ${g}`, groupName: g });
    });
  };

  const joinGroup = (gname) => {
    setError("");
    if (!socketInstance) return setError("Not connected to server");
    socketInstance.emit("groups:join", gname, (res) => {
      if (!res?.ok) return setError(res?.error || "Join group failed");
      setActive({ kind: "group", room: `group:${gname}`, label: `Group: ${gname}`, groupName: gname });
    });
  };

  const [text, setText] = useState("");
  const sendMessage = () => {
    setError("");
    const t = text.trim();
    if (!active) return setError("Select a chat first");
    if (!t) return; // ignore empty
    if (!socketInstance) return setError("Not connected to server");
    if (active.kind === "dm") {
      socketInstance.emit("dm:message", { room: active.room, text: t }, (res) => {
        if (!res?.ok) return setError(res?.error || "Send failed");
      });
    } else if (active.kind === "group") {
      socketInstance.emit("group:message", { groupName: active.groupName, text: t }, (res) => {
        if (!res?.ok) return setError(res?.error || "Send failed");
      });
    }
    setText("");
  };

  const renderLogin = () => (
    <div className="login-wrap">
      <div className="login-card">
        <h2 style={{ marginTop: 0 }}>Welcome</h2>
        <p className="muted">Pick a unique name to join the chat.</p>
        <div className="stack">
          <input
            className="input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter unique username"
            onKeyDown={(e) => e.key === "Enter" && doRegister()}
          />
          <button className="btn" onClick={doRegister}>Join</button>
        </div>
        {error && <p style={{ color: "crimson" }}>{error}</p>}
        <p className="muted" style={{ marginTop: 16 }}>
          Server: <code>{serverURL}</code>
        </p>
      </div>
    </div>
  );

  const isMember = (g) => (g?.members || []).includes(you);

  const renderMain = () => (
    <div className="app-shell">
      <aside className="sidebar" style={{ overflow: "auto" }}>
        <h3 className="hello">Hi, {you}</h3>
        <section className="section">
          <h4>Online users</h4>
          <ul className="list">
            {users.map((u) => {
              const roomForU = dmRooms[u];
              const count = roomForU ? (unread[roomForU] || 0) : 0;
              return (
                <li key={u} className="user-item">
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>{u}{u === you ? " (you)" : ""}</span>
                    {/* Show logo badge if there are unread messages for this user's DM */}
                          {u !== you && count > 0 && (
                            <UnreadLogo size={20} count={count} badgeColor="#ff3b30" onlyBadge={true} />
                          )}
                  </span>
                  {u !== you && (
                    <button 
                      className="btn btn-small" 
                      onClick={() => {
                        startDM(u);
                        // If we already had a room mapping, clear unread now
                        if (dmRooms[u]) setUnread(prev => ({ ...prev, [dmRooms[u]]: 0 }));
                      }}
                    >DM</button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
        <section className="section">
          <h4>Groups</h4>
          <div className="group-form">
            <input
              className="input"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="New group name"
              onKeyDown={(e) => e.key === "Enter" && createGroup()}
            />
            <button className="btn" onClick={createGroup}>Create</button>
          </div>
          <ul className="list">
            {groups.map((g) => (
              <li key={g.name} className="group-item">
                <strong>
                  {g.name}
                  {/* Show unread count if exists for this group */}
                  {isMember(g) && (() => {
                    const room = `group:${g.name}`;
                    const c = unread[room] || 0;
                    return c > 0 ? <UnreadLogo size={16} count={c} badgeColor="#ff3b30" onlyBadge={true} /> : null;
                  })()}
                </strong>
                {isMember(g) ? (
                  <button
                    className="btn btn-small"
                    onClick={() => {
                      setActive({ kind: "group", room: `group:${g.name}`, label: `Group: ${g.name}`, groupName: g.name });
                      // Clear unread count when opening group
                      setUnread(prev => ({ ...prev, [`group:${g.name}`]: 0 }));
                    }}
                  >Open</button>
                ) : (
                  <button className="btn btn-small" onClick={() => joinGroup(g.name)}>Join</button>
                )}
              </li>
            ))}
          </ul>
          <p className="muted" style={{ marginTop: 8 }}>
            Members of selected group appear inside the group’s page.
          </p>
        </section>
        {error && <p style={{ color: "crimson", marginTop: 8 }}>{error}</p>}
      </aside>

      <main className="main">
        <header className="chat-header">
          <h3 className="chat-title">{active ? active.label : "Select a chat"}</h3>
          {active && active.kind === "group" && (
            <div className="members-row">
              {(groups.find((g) => g.name === active.groupName)?.members || []).map((m) => (
                <span key={m} className={`chip ${m === you ? 'me' : ''}`}>{m}</span>
              ))}
            </div>
          )}
        </header>
        <section className="chat-body">
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
        </section>
        <footer className="chat-footer">
          <div className="stack">
            <input
              className="input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder={active ? "Type a message" : "Select a chat to start"}
              disabled={!active}
            />
            <button className="btn" onClick={sendMessage} disabled={!active}>Send</button>
          </div>
        </footer>
      </main>
      {/* Toasts container (bottom-right) */}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className="toast" onClick={() => {
            try {
              window.focus();
              if (t.type === "group") {
                setActive({ kind: "group", room: t.room, label: `Group: ${t.room.replace(/^group:/, '')}`, groupName: t.room.replace(/^group:/, '') });
                // Clear unread count when opening group from toast
                setUnread(prev => ({ ...prev, [t.room]: 0 }));
              } else {
                // try to show DM label using sender
                setActive({ kind: "dm", room: t.room, label: `DM` });
                // Clear unread count when opening DM from toast
                setUnread(prev => ({ ...prev, [t.room]: 0 }));
              }
              // remove this toast
              setToasts((prev) => prev.filter((x) => x.id !== t.id));
            } catch (e) {
              // ignore
            }
          }}>
            <div className="toast-title">{t.title}</div>
            <div className="toast-body">{t.body}</div>
          </div>
        ))}
      </div>
    </div>
  );

  return registered ? renderMain() : renderLogin();
}

export default App;
