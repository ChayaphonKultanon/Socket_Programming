# Simple Multi-Client Chat (Socket Programming Term Project)

This project implements a simple chat application satisfying the term project requirements (R1–R11): unique usernames, user presence list, private (direct) messages, group creation/join, and group messaging using Socket.IO over WebSockets.

## Features Mapping

| Requirement                | Implemented | Notes                                                                                                |
| -------------------------- | ----------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| R1 System Architecture     | ✓           | One Node.js server + multiple React clients. Run clients on different machines using the server URL. |
| R2 Socket Programming      | ✓           | Socket.IO (WebSocket transport) used for all chat traffic.                                           |
| R3 Unique name             | ✓           | Client must register a unique username before chatting.                                              |
| R4 List of clients         | ✓           | Live user list updates on connect/disconnect.                                                        |
| R5 Room per chat           | ✓           | DM rooms (dm:usernameA                                                                               | usernameB) and group rooms (group:groupName). |
| R6 Chat window & box       | ✓           | UI shows messages + input box per active room.                                                       |
| R7 Private messaging       | ✓           | Start DM with any online user; only participants see messages.                                       |
| R8 Create group            | ✓           | User creates group; initially only themselves.                                                       |
| R9 List groups & members   | ✓           | Group list auto-updates with member sets.                                                            |
| R10 Join group voluntarily | ✓           | User clicks Join; no auto-add.                                                                       |
| R11 Group messaging        | ✓           | Messages broadcast only to members in room.                                                          |

## Tech Stack

Server: Node.js + Express + Socket.IO (in-memory state)
Client: React (Create React App) + Socket.IO Client

## Folder Structure

```
server/       # Node.js server (index.js)
client/       # React application (src/App.js implements UI)
```

## Running Locally

Open two terminals.

1. Start the server:

```bash
cd server
npm install
npm run dev
```

Server runs on port 4000 by default.

2. Start the client (on same or different machines):

```bash
cd client
npm install
npm start
```

By default the client derives the server URL as `http://<host>:4000`. To point to a remote server, create `.env` in `client/`:

```
REACT_APP_SERVER_URL=http://SERVER_IP_OR_HOST:4000
```

Restart the client after changes.

## Usage Flow

1. Enter a unique username and click Join.
2. See the list of online users; click DM to open a direct chat. First DM click establishes the room.
3. Create a group by entering a name and clicking Create; you become its sole member and can open it.
4. Other users see the new group and can Join; members then exchange messages visible only to that group.
5. Switch between active DM or group chats; messages show sender and timestamp.

## Server Events Summary

| Event         | Direction            | Payload                           | Description                                           |
| ------------- | -------------------- | --------------------------------- | ----------------------------------------------------- |
| register      | client->server       | username (string)                 | Register unique username; ack returns users & groups. |
| users:update  | server->client       | [usernames]                       | Broadcast on changes.                                 |
| users:list    | client->server (ack) | —                                 | Request current users list.                           |
| groups:create | client->server       | groupName (string)                | Create new group (self as first member).              |
| groups:join   | client->server       | groupName (string)                | Join existing group.                                  |
| groups:list   | client->server (ack) | —                                 | Ack with list of groups.                              |
| groups:update | server->client       | [groups]                          | Broadcast group changes.                              |
| group:message | both ways            | {groupName,text} / message object | Send/receive group messages.                          |
| dm:start      | client->server       | toUsername (string)               | Establish private DM room.                            |
| dm:ready      | server->client       | {room,with[]}                     | Notifies both participants of DM room.                |
| dm:message    | both ways            | {room,text} / message object      | Send/receive private messages.                        |

Messages delivered include: `{ room, type: 'dm'|'group', from, text, timestamp, groupName? }`.

## Non-Persistent State

All state (users, groups, membership) is in memory. Restarting the server clears rooms and active connections. Persistence can be added (e.g., Redis/PostgreSQL) as an enhancement.

## Deployment Notes (Optional for R1 Special Point)

You may deploy the server to a cloud VM or platform (e.g., Render, Railway, AWS EC2). Open port 4000 and set `REACT_APP_SERVER_URL` accordingly for remote clients.

## Potential Enhancements (Part 3 Special Points)

- Message history persistence
- Typing indicators
- File transfer (binary over Socket.IO)
- Basic authentication / tokens
- Admin commands (kick, list rooms)
- Encryption (e2e, e.g., using libsodium)

## Troubleshooting

| Issue                     | Possible Cause                | Fix                                |
| ------------------------- | ----------------------------- | ---------------------------------- |
| Username already taken    | Duplicate registration        | Pick another unique name.          |
| Group not found           | Typo or not created yet       | Refresh group list; create group.  |
| DM start failed (offline) | Target disconnected           | Wait until user reappears.         |
| Cannot connect            | Server not running / firewall | Ensure server port 4000 reachable. |

## License

Educational project – no specific license set.
