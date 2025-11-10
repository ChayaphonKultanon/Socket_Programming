// Simple pub/sub notification service for in-app toasts
const subscribers = new Set();

export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export function notify(payload) {
  // payload: { title, body, room, type }
  for (const fn of Array.from(subscribers)) {
    try { fn(payload); } catch (e) { console.error('notify subscriber failed', e); }
  }
}

const NotificationService = { subscribe, notify };
export default NotificationService;
