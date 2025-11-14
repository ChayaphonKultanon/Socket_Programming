import React from 'react';

// Deterministic color palette based on username hash
// Expanded to a diverse set (pinks, purples, blues, teals, amber, coral)
const AVATAR_COLORS = [
  '#ff69b4', // hot pink
  '#ff1493', // deep pink
  '#ff8fb4', // light pink
  '#ff7ab2', // vibrant pink
  '#7c5cff', // purple
  '#5a9bff', // sky blue
  '#00c2a8', // teal
  '#00b894', // green-teal
  '#ffd166', // amber
  '#ff7a59', // coral
  '#6c6cff', // indigo
  '#ff5a7e', // rose
];

// Small utility to mix a hex color with white to create a lighter shade
function lightenHex(hex, percent) {
  // Remove leading # if present
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  let r = (num >> 16) & 0xff;
  let g = (num >> 8) & 0xff;
  let b = num & 0xff;

  const amt = Math.round(255 * (percent / 100));
  r = Math.min(255, Math.round(r + (255 - r) * (percent / 100)));
  g = Math.min(255, Math.round(g + (255 - g) * (percent / 100)));
  b = Math.min(255, Math.round(b + (255 - b) * (percent / 100)));

  const toHex = (v) => v.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function getInitials(name) {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('')
    .slice(0, 2);
}

function getColorForName(name) {
  if (!name) return AVATAR_COLORS[0];
  // Simple hash function to consistently assign colors to names
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash) + name.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }
  const colorIndex = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[colorIndex];
}

function getColorIndexForName(name) {
  if (!name) return 0;
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash) + name.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash) % AVATAR_COLORS.length;
}

/**
 * Avatar component that displays user initials in a colorful circle.
 * @param {string} name - The user's name (used for initials and color)
 * @param {number} size - Avatar size in pixels (default: 40)
 * @param {boolean} showStatus - Whether to show online status indicator (default: false)
 * @param {boolean} isOnline - Online status (only used if showStatus is true)
 */
export default function Avatar({ name = '', size = 40, showStatus = false, isOnline = false }) {
  const initials = getInitials(name);
  const bgColor = getColorForName(name);
  const idx = getColorIndexForName(name);
  const lighter = lightenHex(bgColor, 28);
  const bgGradient = `linear-gradient(135deg, ${bgColor}, ${lighter})`;

  const avatarStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: size,
    height: size,
    borderRadius: '50%',
    background: bgGradient,
    color: '#ffffff',
    fontWeight: '700',
    fontSize: Math.max(12, size / 2.2),
    lineHeight: 1,
    position: 'relative',
    flexShrink: 0,
    boxShadow: `0 2px 6px rgba(0, 0, 0, 0.12)`,
    userSelect: 'none',
  };

  const statusIndicatorStyle = {
    position: 'absolute',
    bottom: '-2px',
    right: '-2px',
    width: size * 0.3,
    height: size * 0.3,
    borderRadius: '50%',
    background: isOnline ? '#28a745' : '#a0a0a0',
    border: '2px solid var(--white)',
    transition: 'background 0.3s ease',
  };

  return (
    <div className={`avatar avatar--${idx}`} style={avatarStyle} title={name}>
      {initials}
      {showStatus && <div style={statusIndicatorStyle} />}
    </div>
  );
}
