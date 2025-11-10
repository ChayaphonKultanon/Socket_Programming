import React, { useEffect, useState } from "react";
import { io } from "socket.io-client";
import "./App.css";

const serverURL =
  process.env.REACT_APP_SERVER_URL ||
  `${window.location.protocol}//${window.location.hostname}:4000`;

function App() {
  // Create a single socket instance (avoids duplicate connections in StrictMode)
  const [socketInstance] = useState(() => io(serverURL));

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

  // Register and subscriptions
  useEffect(() => {
    const onUsersUpdate = (list) => setUsers(list || []);
    const onGroupsUpdate = (list) => setGroups(list || []);

    const onDmReady = (payload) => {
      // payload: { room, type: 'dm', with: [a,b] }
      // Ensure messages state exists
      setMessagesByRoom((prev) => ({ ...prev, [payload.room]: prev[payload.room] || [] }));
      // If no active chat, auto-select this DM
      if (!active) {
        const other = (payload.with || []).find((u) => u !== you) || payload.with?.[0];
        setActive({ kind: "dm", room: payload.room, label: `DM with ${other}` });
      }
    };

    const onDmMessage = (msg) => {
      setMessagesByRoom((prev) => ({
        ...prev,
        [msg.room]: [...(prev[msg.room] || []), msg],
      }));
    };

    const onGroupMessage = (msg) => {
      setMessagesByRoom((prev) => ({
        ...prev,
        [msg.room]: [...(prev[msg.room] || []), msg],
      }));
    };

    socketInstance.on("users:update", onUsersUpdate);
    socketInstance.on("groups:update", onGroupsUpdate);
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
    socketInstance.on("dm:ready", onDmReady);
    socketInstance.on("dm:message", onDmMessage);
    socketInstance.on("group:message", onGroupMessage);

    return () => {
      socketInstance.off("users:update", onUsersUpdate);
      socketInstance.off("groups:update", onGroupsUpdate);
      socketInstance.off("dm:ready", onDmReady);
      socketInstance.off("dm:message", onDmMessage);
      socketInstance.off("group:message", onGroupMessage);
      socketInstance.off('groups:join:request', onJoinRequest);
      socketInstance.off('groups:approved', onApproved);
      socketInstance.off('groups:rejected', onRejected);
    };
  }, [socketInstance, active, you]);

  const doRegister = () => {
    setError("");
    const name = username.trim();
    if (!name) return setError("Please enter a username");
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
  socketInstance.emit("dm:start", toUsername, (res) => {
      if (!res?.ok) return setError(res?.error || "DM start failed");
      // Select this DM
      setActive({ kind: "dm", room: res.room, label: `DM with ${toUsername}` });
    });
  };

  const [groupName, setGroupName] = useState("");
  const [groupPrivate, setGroupPrivate] = useState(false);
  const [groupRequestMsg, setGroupRequestMsg] = useState("");
  const createGroup = () => {
    setError("");
    const g = groupName.trim();
    if (!g) return setError("Group name is required");
  socketInstance.emit("groups:create", { name: g, private: groupPrivate }, (res) => {
      if (!res?.ok) return setError(res?.error || "Create group failed");
      setGroupName("");
      setActive({ kind: "group", room: `group:${g}`, label: `Group: ${g}`, groupName: g });
    });
  };

  const joinGroup = (gname) => {
    setError("");
    setGroupRequestMsg("");
    const g = groups.find((x) => x.name === gname);
    if (g && g.private) {
      // send join request
      socketInstance.emit("groups:requestJoin", gname, (res) => {
        if (!res?.ok) return setError(res?.error || "Request failed");
        setGroupRequestMsg("Request sent");
      });
      return;
    }
    socketInstance.emit("groups:join", gname, (res) => {
      if (!res?.ok) return setError(res?.error || "Join group failed");
      setActive({ kind: "group", room: `group:${gname}`, label: `Group: ${gname}`, groupName: gname });
    });
  };

  const deleteGroup = (gname) => {
    setError("");
    if (!window.confirm(`Delete group "${gname}"? This will remove the group for everyone.`)) return;
    socketInstance.emit("groups:delete", gname, (res) => {
      if (!res?.ok) return setError(res?.error || "Delete group failed");
      // If the deleted group was active, clear active
      if (active?.groupName === gname) setActive(null);
    });
  };

  const [text, setText] = useState("");
  const sendMessage = () => {
    setError("");
    const t = text.trim();
    if (!active) return setError("Select a chat first");
    if (!t) return; // ignore empty

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
            {users.map((u) => (
              <li key={u} className="user-item">
                <span>{u}{u === you ? " (you)" : ""}</span>
                {u !== you && (
                  <button className="btn btn-small" onClick={() => startDM(u)}>DM</button>
                )}
              </li>
            ))}
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
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 8 }}>
              <input type="checkbox" checked={groupPrivate} onChange={(e) => setGroupPrivate(e.target.checked)} /> Private
            </label>
            <button className="btn" onClick={createGroup}>Create</button>
          </div>
          <ul className="list">
            {groups.map((g) => (
              <li key={g.name} className="group-item">
                <strong>{g.name}{g.private ? ' 🔒' : ''}</strong>
                {isMember(g) ? (
                  <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    <button
                      className="btn btn-small"
                      onClick={() => setActive({ kind: "group", room: `group:${g.name}`, label: `Group: ${g.name}`, groupName: g.name })}
                    >Open</button>
                    <button className="btn btn-small" onClick={() => deleteGroup(g.name)}>Delete</button>
                  </div>
                ) : (
                  <button className="btn btn-small" onClick={() => joinGroup(g.name)}>{g.private ? 'Request to join' : 'Join'}</button>
                )}
                {g.pending && g.pending.length > 0 && <small style={{ marginLeft: 8, color: '#666' }}>{g.pending.length} pending</small>}
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
              {(() => {
                const ag = groups.find((g) => g.name === active.groupName);
                if (ag && ag.owner === you && ag.pending && ag.pending.length) {
                  return (
                    <div style={{ marginLeft: 12 }}>
                      <div style={{ fontSize: 12, color: '#333', marginTop: 6 }}>Pending requests:</div>
                      {ag.pending.map((p) => (
                        <div key={p} style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                          <span className="chip">{p}</span>
                          <button className="btn btn-small" onClick={() => {
                            socketInstance.emit('groups:approve', { groupName: ag.name, username: p }, (res) => {
                              if (!res?.ok) return setError(res?.error || 'Approve failed');
                            });
                          }}>Approve</button>
                          <button className="btn btn-small" onClick={() => {
                            socketInstance.emit('groups:reject', { groupName: ag.name, username: p }, (res) => {
                              if (!res?.ok) return setError(res?.error || 'Reject failed');
                            });
                          }}>Reject</button>
                        </div>
                      ))}
                    </div>
                  );
                }
                return null;
              })()}
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
    </div>
  );

  return registered ? renderMain() : renderLogin();
}

export default App;
