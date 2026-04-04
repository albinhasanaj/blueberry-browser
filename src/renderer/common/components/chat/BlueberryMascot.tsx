import React from "react";

export const BlueberryMascot: React.FC<{ className?: string }> = ({
  className,
}) => (
  <svg
    viewBox="0 0 120 140"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* Body */}
    <ellipse cx="60" cy="85" rx="38" ry="42" fill="#5B7DB1" />
    <ellipse cx="60" cy="85" rx="38" ry="42" fill="url(#bodyGrad)" />
    {/* Highlight */}
    <ellipse cx="48" cy="70" rx="12" ry="16" fill="rgba(255,255,255,0.12)" />
    {/* Crown / top leaves */}
    <path
      d="M48 46 L52 32 L56 44"
      fill="#6B9B5E"
      stroke="#5A8A4E"
      strokeWidth="1"
    />
    <path
      d="M56 44 L60 28 L64 44"
      fill="#7BAA6E"
      stroke="#5A8A4E"
      strokeWidth="1"
    />
    <path
      d="M64 44 L68 32 L72 46"
      fill="#6B9B5E"
      stroke="#5A8A4E"
      strokeWidth="1"
    />
    {/* Eyes */}
    <circle cx="48" cy="82" r="4" fill="#2D3748" />
    <circle cx="72" cy="82" r="4" fill="#2D3748" />
    <circle cx="49.5" cy="80.5" r="1.5" fill="white" />
    <circle cx="73.5" cy="80.5" r="1.5" fill="white" />
    {/* Smile */}
    <path
      d="M52 94 Q60 102 68 94"
      fill="none"
      stroke="#2D3748"
      strokeWidth="2.5"
      strokeLinecap="round"
    />
    {/* Cheeks */}
    <ellipse cx="42" cy="92" rx="5" ry="3.5" fill="rgba(255,150,150,0.3)" />
    <ellipse cx="78" cy="92" rx="5" ry="3.5" fill="rgba(255,150,150,0.3)" />
    {/* Little feet */}
    <ellipse cx="48" cy="126" rx="8" ry="5" fill="#4A6A9A" />
    <ellipse cx="72" cy="126" rx="8" ry="5" fill="#4A6A9A" />
    <defs>
      <radialGradient id="bodyGrad" cx="40%" cy="35%" r="60%">
        <stop offset="0%" stopColor="rgba(255,255,255,0.1)" />
        <stop offset="100%" stopColor="rgba(0,0,0,0.08)" />
      </radialGradient>
    </defs>
  </svg>
);
