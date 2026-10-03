'use client';

/**
 * Inline MOTIONA Studio brand mark.
 *
 * The same geometry as public/icon.svg, rendered inline so headers get a crisp,
 * theme-independent mark without an extra request. Gradient ids are suffixed
 * with useId() because several instances can share a document.
 */

import { useId } from 'react';

export default function BrandMark({ size = 28 }: { size?: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const bg = `maBg${uid}`;
  const play = `maPlay${uid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block', flex: 'none' }}
    >
      <defs>
        <linearGradient id={bg} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#241b36" />
          <stop offset="1" stopColor="#0b0a10" />
        </linearGradient>
        <linearGradient id={play} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#a78bfa" />
          <stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="112" fill={`url(#${bg})`} />
      <circle cx="350" cy="190" r="62" fill="none" stroke="#8b5cf6" strokeOpacity="0.5" strokeWidth="8" />
      <path d="M118 356V156h68l70 118 70-118h68v200h-64V257l-74 121h-2l-74-121v99z" fill="#ffffff" />
      <path d="M306 156h88l-44 76z" fill={`url(#${play})`} />
    </svg>
  );
}
