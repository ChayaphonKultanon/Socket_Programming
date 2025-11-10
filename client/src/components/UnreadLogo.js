import React from 'react';

// Small unread badge / logo used by the sidebar and group list.
export default function UnreadLogo({ size = 28, count = 0, badgeColor = '#ff3b30', onlyBadge = false }) {
  if (!count) return null;
  const label = Number(count) > 99 ? '99+' : String(count);
  const style = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 20,
    height: 20,
    padding: '0 6px',
    borderRadius: 9999,
    background: badgeColor,
    color: '#fff',
    fontSize: 12,
    fontWeight: 700,
    lineHeight: 1,
  };

  if (onlyBadge) return <span style={style} title={`${count} unread`}>{label}</span>;

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: size, height: size, borderRadius: 8, background: '#fff', border: '1px solid rgba(0,0,0,0.06)' }} />
      <span style={style} title={`${count} unread`}>{label}</span>
    </span>
  );
}
