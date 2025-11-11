import React, { useEffect, useState } from 'react';
import { subscribe } from '../notifications/notificationService';

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

export default function Notifications({ onOpen }) {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const unsub = subscribe((payload) => {
      if (!payload) return;
      const id = makeId();
      const t = {
        id,
        title: payload.title || '',
        body: payload.body || '',
        room: payload.room,
        type: payload.type,
      };
      setToasts((prev) => [t, ...prev]);
      // auto-dismiss
      setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 4200);
    });
    return unsub;
  }, []);

  return (
    <div className="notification-container">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="notification"
          onClick={() => {
            try {
              if (onOpen && typeof onOpen === 'function') onOpen(t.room, t.type);
              setToasts((prev) => prev.filter((x) => x.id !== t.id));
            } catch (e) {
              /* ignore */
            }
          }}
        >
          <div className="notification-title">{t.title}</div>
          <div className="notification-body">{t.body}</div>
        </div>
      ))}
    </div>
  );
}
