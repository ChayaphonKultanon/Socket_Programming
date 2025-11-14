import React from 'react';

// Small unread badge / logo used by the sidebar and group list.
export default function UnreadLogo({
  size = 28,
  count = 0,
  badgeColor = '#FF3B30',
  onlyBadge = false,
}) {
  if (!count) return null;
  const label = Number(count) > 99 ? '99+' : String(count);
  // If badgeColor is a CSS variable (var(--...)) we prefer a CSS gradient helper via class
  const isCssVar = typeof badgeColor === 'string' && badgeColor.trim().startsWith('var(');

  // Helper to compute a lighter shade for hex colors
  function lightenHex(hex, percent) {
    const clean = hex.replace('#', '');
    const num = parseInt(clean, 16);
    let r = (num >> 16) & 0xff;
    let g = (num >> 8) & 0xff;
    let b = num & 0xff;
    r = Math.min(255, Math.round(r + (255 - r) * (percent / 100)));
    g = Math.min(255, Math.round(g + (255 - g) * (percent / 100)));
    b = Math.min(255, Math.round(b + (255 - b) * (percent / 100)));
    const toHex = (v) => v.toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  const style = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 20,
    height: 20,
    padding: '0 6px',
    borderRadius: 9999,
    background: isCssVar ? undefined : badgeColor,
    color: 'var(--btn-primary-color)',
    fontSize: 12,
    fontWeight: 700,
    lineHeight: 1,
  };

  if (onlyBadge)
    return (
      <span style={style} title={`${count} unread`}>
        {label}
      </span>
    );

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span
        style={{
          width: size,
          height: size,
          borderRadius: 8,
          background: 'var(--white)',
          border: '1px solid var(--surface-border)',
        }}
      />
      {/* If badgeColor is a CSS var, rely on .icon-bg for a themed gradient */}
      {isCssVar ? (
        <span className="icon-bg" style={{ minWidth: 20, height: 20, padding: '0 6px' }} title={`${count} unread`}>
          {label}
        </span>
      ) : (
        <span style={style} title={`${count} unread`}>
          {label}
        </span>
      )}
    </span>
  );
}
