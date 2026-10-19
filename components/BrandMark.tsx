'use client';

export default function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label="MOTIONA"
      focusable="false"
      style={{ display: 'block', flex: 'none' }}
    >
      <rect width="48" height="48" rx="13" fill="#101310" />
      <path
        d="M10 34V14h5l9 12 9-12h5v20h-5V22l-9 12-9-12v12z"
        fill="#D6F269"
        stroke="#D6F269"
        strokeLinejoin="round"
      />
      <path d="M19 9h10l-5 5z" fill="#F5F6F0" />
    </svg>
  );
}
