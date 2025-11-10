import React from 'react';

// UnreadLogo
// Props:
// - size: number (px) - width and height
// - count: number - unread count to show
// - bubbleColor: string - main bubble fill (default: white)
// - badgeColor: string - badge fill (default: hot pink)
// - textColor: string - badge text color (default: white)
// Usage: <UnreadLogo size={40} count={3} />

export default function UnreadLogo({ size = 15, count = 0, bubbleColor = '#ffffff', badgeColor = '#ff3b30', textColor = '#ffffff', title = 'Messages', onlyBadge = false }) {
  const display = count > 99 ? '99+' : String(count);
  const showBadge = count && count > 0;

  // If the consumer wants only the numeric badge (no chat bubble), render a compact circle
  if (onlyBadge) {
    // Use a smaller viewBox so the circle fills the SVG nicely
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        xmlns="http://www.w3.org/2000/svg"
        aria-label={title + (showBadge ? ` (${display} unread)` : '')}
        role="img"
      >
        <title>{title}</title>
        {showBadge && (
          <g>
            <circle cx="16" cy="16" r="14" fill={badgeColor} />
            <text
              x="16"
              y="20"
              textAnchor="middle"
              fontFamily="Arial, Helvetica, sans-serif"
              fontSize="12"
              fontWeight="700"
              fill={textColor}
            >
              {display}
            </text>
          </g>
        )}
      </svg>
    );
  }

  // Default: full chat-bubble logo with a small badge (kept for other uses)
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      aria-label={title + (showBadge ? ` (${display} unread)` : '')}
      role="img"
    >
      <title>{title}</title>
      {/* chat bubble */}
      <g transform="translate(0,0)">
        <path
          d="M10 12c0-4.418 3.582-8 8-8h28c4.418 0 8 3.582 8 8v22c0 4.418-3.582 8-8 8H30l-10 8V12z"
          fill={bubbleColor}
          stroke="#e9c0d5"
          strokeWidth="1"
        />
        {/* three dots in bubble */}
        <circle cx="26" cy="28" r="3" fill="#7a5a67" />
        <circle cx="34" cy="28" r="3" fill="#7a5a67" />
        <circle cx="42" cy="28" r="3" fill="#7a5a67" />
      </g>

      {/* unread badge (top-right) */}
      {showBadge && (
        <g>
          <circle cx="48" cy="12" r="12" fill={badgeColor} />
          <text
            x="48"
            y="16"
            textAnchor="middle"
            fontFamily="Arial, Helvetica, sans-serif"
            fontSize="11"
            fontWeight="700"
            fill={textColor}
          >
            {display}
          </text>
        </g>
      )}
    </svg>
  );
}
