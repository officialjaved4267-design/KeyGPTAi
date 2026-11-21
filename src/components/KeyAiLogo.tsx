import React from 'react';

interface KeyAiLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showTagline?: boolean;
}

export const KeyAiLogo: React.FC<KeyAiLogoProps> = ({ size = 'md', showTagline = false }) => {
  const iconDim = size === 'sm' ? 'w-8 h-8' : size === 'lg' ? 'w-11 h-11' : 'w-9 h-9';
  const textSize = size === 'sm' ? 'text-lg' : size === 'lg' ? 'text-2xl' : 'text-xl';

  return (
    <div className="flex items-center gap-3 select-none">
      <div
        className={`${iconDim} rounded-xl bg-[#161326] border border-violet-500/35 flex items-center justify-center shrink-0 shadow-sm`}
      >
        <svg viewBox="0 0 36 36" fill="none" className="w-6 h-6" aria-hidden="true">
          <defs>
            <linearGradient id="keyai_prism" x1="4" y1="4" x2="32" y2="32" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#C4B5FD" />
              <stop offset="55%" stopColor="#8B5CF6" />
              <stop offset="100%" stopColor="#5B21B6" />
            </linearGradient>
          </defs>
          <path
            d="M14.5 7C10.3579 7 7 10.3579 7 14.5C7 18.6421 10.3579 22 14.5 22C16.21 22 17.786 21.428 19.048 20.464L26.5 28H29.5V24.5L26.75 21.75H24.25V19.25L21.964 16.964C22.309 16.197 22.5 15.37 22.5 14.5C22.5 10.3579 18.6421 7 14.5 7Z"
            stroke="url(#keyai_prism)"
            strokeWidth="2.2"
            strokeLinejoin="round"
          />
          <circle cx="13.5" cy="13.5" r="2.5" fill="#DDD6FE" />
          <path d="M27 7L29 11L33 13L29 15L27 19L25 15L21 13L25 11L27 7Z" fill="#A78BFA" />
        </svg>
      </div>
      <div className="min-w-0">
        <span className={`${textSize} font-bold font-display tracking-tight text-white whitespace-nowrap`}>
          Key<span className="text-violet-400">Ai</span>
        </span>
        {showTagline && (
          <p className="text-xs text-slate-400 truncate">One AI. Unlimited Creativity.</p>
        )}
      </div>
    </div>
  );
};
