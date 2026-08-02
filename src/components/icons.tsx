/** Stroke icons, 24x24 viewBox, sized by CSS. */
type P = { className?: string };

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export const HomeIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M3 10.2 12 3.5l9 6.7V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
  </svg>
);

export const DumbbellIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M6.5 8v8M3.5 10v4M17.5 8v8M20.5 10v4M6.5 12h11" />
  </svg>
);

export const ListIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M8 6h12M8 12h12M8 18h12M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
  </svg>
);

export const PlayIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M6 4.8v14.4a1 1 0 0 0 1.53.85l11.2-7.2a1 1 0 0 0 0-1.7L7.53 3.95A1 1 0 0 0 6 4.8z" />
  </svg>
);

export const ClockIcon = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 1.8" />
  </svg>
);

export const PlusIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const CloseIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export const TrashIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 7h16M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7M6.5 7l.8 12.1a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7" />
  </svg>
);

export const ChevronLeftIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M14.5 5.5 8 12l6.5 6.5" />
  </svg>
);

export const ChevronRightIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M9.5 5.5 16 12l-6.5 6.5" />
  </svg>
);

export const GearIcon = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M19.4 14a1.6 1.6 0 0 0 .32 1.77l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.6 1.6 0 0 0-1.77-.32 1.6 1.6 0 0 0-1 1.47V20a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1.05-1.47 1.6 1.6 0 0 0-1.77.32l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.6 1.6 0 0 0 4.6 14a1.6 1.6 0 0 0-1.47-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 8a1.6 1.6 0 0 0-.32-1.77l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.6 1.6 0 0 0 8.88 3.7 1.6 1.6 0 0 0 9.93 2.23V2a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.47 1.6 1.6 0 0 0 1.78-.32l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.6 1.6 0 0 0 19.4 8v.05a1.6 1.6 0 0 0 1.47 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
  </svg>
);

export const DownloadIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 3.5v11M7.5 10.5 12 15l4.5-4.5M4 17.5v1.5a1.5 1.5 0 0 0 1.5 1.5h13a1.5 1.5 0 0 0 1.5-1.5v-1.5" />
  </svg>
);

export const UploadIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M4 17.5v1.5a1.5 1.5 0 0 0 1.5 1.5h13a1.5 1.5 0 0 0 1.5-1.5v-1.5" />
  </svg>
);

export const CheckIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="m5 12.5 4.5 4.5L19 7" />
  </svg>
);

export const AlertIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 8v5M12 16.5h.01" />
    <circle cx="12" cy="12" r="8.5" />
  </svg>
);

/** Two columns of dots — a drag handle. */
export const GripIcon = (p: P) => (
  <svg {...base} {...p} strokeWidth={2.4}>
    <path d="M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01" />
  </svg>
);

export const PencilIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M14.5 5.5 18.5 9.5 8 20H4v-4z" />
    <path d="M12.5 7.5 16.5 11.5" />
  </svg>
);

export const SunIcon = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="4.2" />
    <path d="M12 2.5v2.3M12 19.2v2.3M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M2.5 12h2.3M19.2 12h2.3M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6" />
  </svg>
);

export const MoonIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M20 14.2A8.5 8.5 0 1 1 9.8 4a6.7 6.7 0 0 0 10.2 10.2z" />
  </svg>
);
