import { useEffect, useState } from "react";
import { io } from "socket.io-client";

// Simple hook that creates a single socket instance and cleans up on unmount
export default function useSocket(serverURL) {
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    if (!serverURL) return;
    const s = io(serverURL);
    setSocket(s);
    return () => {
      try {
        s.disconnect();
      } catch (e) {
        // ignore
      }
    };
  }, [serverURL]);

  return socket;
}
