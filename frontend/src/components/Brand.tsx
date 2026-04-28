export function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 56"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="SocialMind"
    >
      {/* VR headset outer frame (the band + lens housing) */}
      <path
        d="M4 18 C4 13 8 9 13 9 H51 C56 9 60 13 60 18 V34 C60 39 56 43 51 43 H45 C42 43 39 41 37.5 38.5 L35 34 C33.5 31.5 30.5 31.5 29 34 L26.5 38.5 C25 41 22 43 19 43 H13 C8 43 4 39 4 34 Z"
        stroke="#4F69FF"
        strokeWidth="3.5"
        fill="none"
        strokeLinejoin="round"
      />
      {/* Two circular heads inside the lens area */}
      <circle cx="22" cy="22" r="5.5" fill="#4F69FF" />
      <circle cx="42" cy="22" r="5.5" fill="#4F69FF" />
      {/* Two embracing figures — shoulders/bodies merging */}
      <path
        d="M13 43 C13 38 17 35 22 35 C26 35 29 37 30.5 40 C31.2 41 32.8 41 33.5 40 C35 37 38 35 42 35 C47 35 51 38 51 43"
        fill="#4F69FF"
      />
      {/* Small heart on the right figure's chest */}
      <path
        d="M42 40.5 C41.2 39.7 40 39.8 39.5 40.7 C39 39.8 37.8 39.7 37 40.5 C36.2 41.3 36.4 42.4 37.2 43.2 L39.5 45.5 L41.8 43.2 C42.6 42.4 42.8 41.3 42 40.5 Z"
        fill="white"
      />
    </svg>
  );
}

export function BrandWordmark({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const text = size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-base' : 'text-lg';
  const gap = size === 'lg' ? 'gap-3' : 'gap-2.5';
  const mark = size === 'lg' ? 42 : size === 'sm' ? 28 : 34;
  return (
    <div className={`inline-flex items-center ${gap}`}>
      <BrandMark size={mark} />
      <span className={`font-semibold tracking-tight ${text} text-[#4F69FF]`}>
        Social<span className="text-slate-100">Mind</span>
      </span>
    </div>
  );
}
