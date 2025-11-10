import React from 'react';

// Small unread badge / logo used in the sidebar and group list.
// Props:
// - size: diameter in px for the badge container (optional)
// - count: number to display (if 0 or falsy, nothing renders)
// - badgeColor: color string for badge background
// - onlyBadge: when true show only badge (no extra chrome)
export default function UnreadLogo({ size = 28, count = 0, badgeColor = '#ff3b30', onlyBadge = false }) {
  if (!count) return null;
  const s = Number(count) > 99 ? '99+' : String(count);
  const badgeStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 20,
    height: 20,
    padding: '0 6px',
    borderRadius: 9999,
    background: badgeColor,
    color: 'white',
    fontSize: 12,
    fontWeight: 700,
    lineHeight: 1,
    boxShadow: '0 2px 6px rgba(0,0,0,0.12)'
  };

  if (onlyBadge) {
    return (
      <span style={badgeStyle} title={`${count} unread`}>
        {s}
      </span>
    );
  }

  // A slightly larger capsule with optional placeholder circle
  const outer = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
  };

  return (
    <span style={outer}>
      <span style={{ width: size, height: size, borderRadius: 8, background: '#fff', border: '1px solid rgba(0,0,0,0.06)', display: 'inline-block' }} />
      <span style={badgeStyle} title={`${count} unread`}>{s}</span>
    </span>
  );
}
