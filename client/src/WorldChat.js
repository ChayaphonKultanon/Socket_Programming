import React, { useEffect, useState } from 'react';
import './WorldChat.css'; // ใช้ CSS เดียวกับ chat ปกติ

const WorldChat = ({ socket, username }) => {
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    if (!socket) return;

    const handleHistory = (history) => setMessages(history || []);
    const handleMessage = (message) => setMessages((prev) => [...prev, message]);

    socket.on('world:history', handleHistory);
    socket.on('world:message', handleMessage);

    return () => {
      socket.off('world:history', handleHistory);
      socket.off('world:message', handleMessage);
    };
  }, [socket]);

  return (
    <div className="messages-container">
      {messages.map((msg, i) => {
        let namePart = msg.from || '';
        let timePart = '';

        if (typeof msg.from === 'string' && msg.from.includes(':')) {
          const parts = msg.from.split(':');
          if (parts.length >= 4) {
            namePart = parts.slice(0, -3).join(':'); // username
            timePart = parts.slice(-3).join(':');    // HH:MM:SS
          }
        }

        const timeToShow = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : '' || timePart;

        const isMe = namePart === username;

        return (
          <div key={msg.id || i} className={`message ${isMe ? 'me' : ''}`}>
            <div className="meta">
              <strong>{namePart}</strong> • {timeToShow}
            </div>
            <div>{msg.text}</div>
          </div>
        );
      })}
    </div>
  );
};

export default WorldChat;
