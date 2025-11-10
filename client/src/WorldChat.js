import React, { useEffect, useState } from 'react';
import './App.css';
import './worldchat-inline.css';

const WorldChat = ({ socket, username }) => {
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    if (!socket) return;

    // Listen for world chat history
    const handleHistory = (history) => {
      setMessages(history || []);
    };

    // Listen for new messages
    const handleMessage = (message) => {
      setMessages(prev => [...prev, message]);
    };

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
        const rawFrom = msg.from || '';
        
        // Extract name and time from rawFrom.
        // Server sends format: "username:HH:MM:SS"
        // Split by colon: if we have 4 parts, last 3 are time
        let namePart = rawFrom;
        let timePart = null;
        
        if (typeof rawFrom === 'string' && rawFrom.includes(':')) {
          const parts = rawFrom.split(':');
          if (parts.length >= 4) {
            // Everything before the last 3 parts is the username (could have colons in theory)
            namePart = parts.slice(0, -3).join(':');
            // Last 3 parts are HH:MM:SS
            timePart = parts.slice(-3).join(':');
          }
        }
        
        const timeToShow = timePart || (msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : '');

        return (
          <div key={msg.id || i} className={`message ${msg.from === username ? 'me' : ''}`}>
            <div className="message-line">
              <span className="message-name">{namePart}</span>
              <span className="sep"> : </span>
              <span className="message-time">{timeToShow}</span>
              <span className="sep"> : </span>
              <span className="message-text">{msg.text}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// Export the component and add display name for debugging
WorldChat.displayName = 'WorldChat';
export default WorldChat;