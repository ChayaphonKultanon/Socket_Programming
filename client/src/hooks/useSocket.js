import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

// Minimal hook that returns a single socket instance connected to the provided URL.
// It opens the connection on first mount (or when url changes) and closes on cleanup.
export default function useSocket(url) {
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    if (!url) return;
    let mounted = true;
    try {
      const s = io(url, { autoConnect: true });
      if (mounted) setSocket(s);
      return () => {
        mounted = false;
        try { s.close(); } catch (e) { /* ignore */ }
      };
    } catch (e) {
      // If socket creation fails, leave socket null
      console.error('useSocket: failed to connect', e);
      return () => {};
    }
  }, [url]);

  return socket;
}
