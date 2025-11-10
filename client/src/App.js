import React, { useEffect, useState } from "react";
import { io } from "socket.io-client";

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
    socketInstance.on("dm:ready", onDmReady);
    socketInstance.on("dm:message", onDmMessage);
    socketInstance.on("group:message", onGroupMessage);

    return () => {
      socketInstance.off("users:update", onUsersUpdate);
      socketInstance.off("groups:update", onGroupsUpdate);
      socketInstance.off("dm:ready", onDmReady);
      socketInstance.off("dm:message", onDmMessage);
      socketInstance.off("group:message", onGroupMessage);
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
  const createGroup = () => {
    setError("");
    const g = groupName.trim();
    if (!g) return setError("Group name is required");
  socketInstance.emit("groups:create", g, (res) => {
      if (!res?.ok) return setError(res?.error || "Create group failed");
      setGroupName("");
      setActive({ kind: "group", room: `group:${g}`, label: `Group: ${g}`, groupName: g });
    });
  };

  const joinGroup = (gname) => {
    setError("");
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
    <div style={{ maxWidth: 420, margin: "40px auto", padding: 16 }}>
      <h2>Login</h2>
      <p>Pick a unique name to join the chat.</p>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Enter unique username"
          onKeyDown={(e) => e.key === "Enter" && doRegister()}
          style={{ flex: 1 }}
        />
        <button onClick={doRegister}>Join</button>
      </div>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      <p style={{ marginTop: 24, color: "#666" }}>
        Server: <code>{serverURL}</code>
      </p>
    </div>
  );

  const isMember = (g) => (g?.members || []).includes(you);

  const renderMain = () => (
    <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", height: "100vh" }}>
      <aside style={{ borderRight: "1px solid #ddd", padding: 12, overflow: "auto" }}>
        <h3>Hi, {you}</h3>
        <section>
          <h4>Online users</h4>
          <ul style={{ listStyle: "none", paddingLeft: 0 }}>
            {users.map((u) => (
              <li key={u} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "4px 0" }}>
                <span>{u}{u === you ? " (you)" : ""}</span>
                {u !== you && (
                  <button onClick={() => startDM(u)} style={{ fontSize: 12 }}>DM</button>
                )}
              </li>
            ))}
          </ul>
        </section>
        <section style={{ marginTop: 16 }}>
          <h4>Groups</h4>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="New group name"
              onKeyDown={(e) => e.key === "Enter" && createGroup()}
              style={{ flex: 1 }}
            />
            <button onClick={createGroup}>Create</button>
          </div>
          <ul style={{ listStyle: "none", paddingLeft: 0 }}>
            {groups.map((g) => (
              <li key={g.name} style={{ padding: "6px 0", borderBottom: "1px solid #eee" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <strong>{g.name}</strong>
                  {isMember(g) ? (
                    <button onClick={() => setActive({ kind: "group", room: `group:${g.name}`, label: `Group: ${g.name}`, groupName: g.name })} style={{ fontSize: 12 }}>Open</button>
                  ) : (
                    <button onClick={() => joinGroup(g.name)} style={{ fontSize: 12 }}>Join</button>
                  )}
                </div>
                <div style={{ color: "#666", fontSize: 12, marginTop: 4 }}>
                  Members: {(g.members || []).join(", ") || "-"}
                </div>
              </li>
            ))}
          </ul>
        </section>
        {error && <p style={{ color: "crimson", marginTop: 8 }}>{error}</p>}
      </aside>
      <main style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <header style={{ padding: 12, borderBottom: "1px solid #ddd", minHeight: 56 }}>
          <h3 style={{ margin: 0 }}>{active ? active.label : "Select a chat"}</h3>
        </header>
        <section style={{ flex: 1, overflow: "auto", padding: 12 }}>
          {active ? (
            <div>
              {(messagesByRoom[active.room] || []).map((m, i) => (
                <div key={i} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 12, color: "#666" }}>
                    <strong>{m.from}</strong> • {new Date(m.timestamp).toLocaleTimeString()}
                  </div>
                  <div>{m.text}</div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: "#666" }}>Pick a user or group to start chatting.</p>
          )}
        </section>
        <footer style={{ padding: 12, borderTop: "1px solid #ddd" }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder={active ? "Type a message" : "Select a chat to start"}
              disabled={!active}
              style={{ flex: 1 }}
            />
            <button onClick={sendMessage} disabled={!active}>Send</button>
          </div>
        </footer>
      </main>
    </div>
  );

  return registered ? renderMain() : renderLogin();
}

export default App;
