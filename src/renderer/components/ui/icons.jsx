import React from 'react';

/**
 * Inline SVG icon set (DESIGN.md §5): 24px grid, stroke 1.75, currentColor.
 * Replaces Material Symbols for all new components. No emojis.
 */
function Icon({ children, size = 16, className = '', strokeWidth = 1.75, ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

/* --- Navigation --- */

export const IconAgent = (props) => (
  <Icon {...props}>
    <path d="M12 3a4 4 0 0 1 4 4v1a4 4 0 0 1-4 4 4 4 0 0 1-4-4V7a4 4 0 0 1 4-4Z" />
    <path d="M5 21c.8-3.2 3.6-5 7-5s6.2 1.8 7 5" />
  </Icon>
);

/** Dual-orbit mark shown while Janus is running a turn. */
export const IconJanusWorking = ({ size = 14, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.75}
    strokeLinecap="round"
    className={className}
    aria-hidden="true"
  >
    <g className="janus-orbit">
      <path d="M18.4 7.2a8 8 0 0 1-4.9 13.1" />
    </g>
    <g className="janus-orbit-rev">
      <path d="M5.6 16.8A8 8 0 0 1 10.5 3.7" />
    </g>
  </svg>
);

export const IconNewTask = (props) => (
  <Icon {...props}>
    <rect x="3" y="3" width="18" height="18" rx="4" />
    <path d="M12 8v8M8 12h8" />
  </Icon>
);

export const IconPlugins = (props) => (
  <Icon {...props}>
    <path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" />
    <path d="M9 17v3a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2v-5h18v5a2 2 0 0 1-2 2h-3a1 1 0 0 1-1-1v-3" />
    <rect x="3" y="7" width="7" height="4" rx="1" />
    <rect x="14" y="7" width="7" height="4" rx="1" />
  </Icon>
);

export const IconDevices = (props) => (
  <Icon {...props}>
    <rect x="2" y="4" width="20" height="12" rx="2" />
    <path d="M8 20h8M12 16v4" />
  </Icon>
);

export const IconPullRequests = (props) => (
  <Icon {...props}>
    <circle cx="6" cy="6" r="2.5" />
    <circle cx="6" cy="18" r="2.5" />
    <circle cx="18" cy="18" r="2.5" />
    <path d="M6 8.5v7M18 15.5V8a2.5 2.5 0 0 0-2.5-2.5H13" />
    <path d="m14.5 4.5-2 1.5 2 1.5" />
  </Icon>
);

export const IconRepositories = (props) => (
  <Icon {...props}>
    <path d="M4 20h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-8L9.6 4.7A1.5 1.5 0 0 0 8.5 4H4a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1Z" />
  </Icon>
);

export const IconSettings = (props) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19 12a7 7 0 0 0-.15-1.4l2.1-1.6-2-3.4-2.5.9a7 7 0 0 0-2.4-1.4L13.7 2h-3.4l-.35 2.7a7 7 0 0 0-2.4 1.4l-2.5-.9-2 3.4 2.1 1.6a7 7 0 0 0 0 2.8l-2.1 1.6 2 3.4 2.5-.9a7 7 0 0 0 2.4 1.4l.35 2.7h3.4l.35-2.7a7 7 0 0 0 2.4-1.4l2.5.9 2-3.4-2.1-1.6A7 7 0 0 0 19 12Z" />
  </Icon>
);

/* --- Chevron / disclosure --- */

export const IconChevronDown = (props) => (
  <Icon {...props}>
    <path d="m6 9 6 6 6-6" />
  </Icon>
);

export const IconChevronRight = (props) => (
  <Icon {...props}>
    <path d="m9 6 6 6-6 6" />
  </Icon>
);

/* --- Actions --- */

export const IconClose = (props) => (
  <Icon {...props}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
);

export const IconSearch = (props) => (
  <Icon {...props}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Icon>
);

export const IconSync = (props) => (
  <Icon {...props}>
    <path d="M20 12a8 8 0 1 1-2.34-5.66" />
    <path d="M20 4v4h-4" />
  </Icon>
);

export const IconSend = (props) => (
  <Icon {...props}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </Icon>
);

export const IconAttach = (props) => (
  <Icon {...props}>
    <rect x="3" y="3" width="18" height="18" rx="4" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <path d="m21 15-4.5-4.5L7 20" />
  </Icon>
);

export const IconMore = (props) => (
  <Icon {...props}>
    <circle cx="5" cy="12" r="0.5" />
    <circle cx="12" cy="12" r="0.5" />
    <circle cx="19" cy="12" r="0.5" />
  </Icon>
);

export const IconExternal = (props) => (
  <Icon {...props}>
    <path d="M14 4h6v6M20 4 10 14" />
    <path d="M19 14v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </Icon>
);

export const IconCheck = (props) => (
  <Icon {...props}>
    <path d="m5 12.5 5 5L19 7" />
  </Icon>
);

export const IconAlert = (props) => (
  <Icon {...props}>
    <path d="M12 3 2.5 20h19L12 3Z" />
    <path d="M12 10v4M12 17.5v.01" />
  </Icon>
);

export const IconPlus = (props) => (
  <Icon {...props}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const IconStop = (props) => (
  <Icon {...props}>
    <rect x="7" y="7" width="10" height="10" rx="1.5" />
  </Icon>
);

export const IconArrowRight = (props) => (
  <Icon {...props}>
    <path d="M4 12h16M14 6l6 6-6 6" />
  </Icon>
);

/* --- Domain --- */

export const IconGitBranch = (props) => (
  <Icon {...props}>
    <circle cx="6" cy="5" r="2.5" />
    <circle cx="6" cy="19" r="2.5" />
    <circle cx="18" cy="9" r="2.5" />
    <path d="M6 7.5v9M18 11.5a7 7 0 0 1-7 7" />
  </Icon>
);

export const IconTerminal = (props) => (
  <Icon {...props}>
    <path d="m5 8 4 4-4 4M12 16h7" />
  </Icon>
);

export const IconClock = (props) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7v5l3 2" />
  </Icon>
);

export const IconWrench = (props) => (
  <Icon {...props}>
    <path d="M14.5 6.5a4 4 0 1 0 3 3L21 13l-8 8-2-2 8-8-4.5-4.5Z" />
    <path d="m5 19 2-2" />
  </Icon>
);

export const IconThinking = (props) => (
  <Icon {...props}>
    <path d="M12 3a4.5 4.5 0 0 1 4.5 4.5c0 1.6-.8 3-2 3.8V13a1.5 1.5 0 0 1-1.5 1.5H11A1.5 1.5 0 0 1 9.5 13v-1.7a4.5 4.5 0 0 1-2-3.8A4.5 4.5 0 0 1 12 3Z" />
    <path d="M9.5 17.5h5M10.5 20.5h3" />
  </Icon>
);

export const IconArtifact = (props) => (
  <Icon {...props}>
    <rect x="3" y="3" width="18" height="18" rx="4" />
    <path d="M7 16V8l5 6V8" />
    <path d="M16.5 8v5M16.5 15.5v.01" />
  </Icon>
);

export const IconUser = (props) => (
  <Icon {...props}>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5 20c.9-3 3.7-4.5 7-4.5s6.1 1.5 7 4.5" />
  </Icon>
);

export const IconFolder = (props) => (
  <Icon {...props}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
  </Icon>
);

export const IconKey = (props) => (
  <Icon {...props}>
    <circle cx="8" cy="14" r="4" />
    <path d="m11 11 8-8M16 4l4 4M14 6l3 3" />
  </Icon>
);

export const IconCloud = (props) => (
  <Icon {...props}>
    <path d="M7 18h10a4 4 0 0 0 .8-7.9A5.5 5.5 0 0 0 7 8.5 4.5 4.5 0 0 0 7 18Z" />
  </Icon>
);

export const IconMonitorOff = (props) => (
  <Icon {...props}>
    <rect x="2" y="4" width="20" height="12" rx="2" />
    <path d="M8 20h8" />
    <path d="m3 3 18 18" />
  </Icon>
);

export const IconTasks = (props) => (
  <Icon {...props}>
    <path d="M4 6h16M4 12h16M4 18h10" />
    <circle cx="19" cy="17" r="2" />
  </Icon>
);

/* --- Tool-call icons (ChatTranscript / ToolCallBlock) --- */

export const IconEdit = (props) => (
  <Icon {...props}>
    <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z" />
    <path d="m14.5 6.5 3 3" />
  </Icon>
);

export const IconWrite = (props) => (
  <Icon {...props}>
    <path d="M5 21h14M5 17h14M6 13l11-8 4 4-11 8H6v-4Z" />
  </Icon>
);

export const IconRead = (props) => (
  <Icon {...props}>
    <path d="M6 3h8l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
    <path d="M8 12h7M8 16h5" />
  </Icon>
);

export const IconGlob = (props) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17M12 3.5c2.8 2.7 4 5.5 4 8.5s-1.2 5.8-4 8.5c-2.8-2.7-4-5.5-4-8.5s1.2-5.8 4-8.5Z" />
  </Icon>
);

export const IconGlobe = (props) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17M12 3.5c2.8 2.7 4 5.5 4 8.5s-1.2 5.8-4 8.5c-2.8-2.7-4-5.5-4-8.5s1.2-5.8 4-8.5Z" />
  </Icon>
);

export const IconExtension = (props) => (
  <Icon {...props}>
    <path d="M10 4a2 2 0 1 1 4 0v2h3a1 1 0 0 1 1 1v3h2a2 2 0 1 1 0 4h-2v3a1 1 0 0 1-1 1h-3v2a2 2 0 1 1-4 0v-2H7a1 1 0 0 1-1-1v-3H4a2 2 0 1 1 0-4h2V7a1 1 0 0 1 1-1h3V4Z" />
  </Icon>
);

export const IconBuild = (props) => (
  <Icon {...props}>
    <path d="m14.5 6.5a4.5 4.5 0 1 0-6.4 4.1L3 16v5h5l5.4-5.1a4.5 4.5 0 0 0 1.1-9.4Z" />
  </Icon>
);

export const IconSend2 = (props) => (
  <Icon {...props}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </Icon>
);

export const IconLogo = ({ size = 18, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    className={className}
    aria-hidden="true"
  >
    <rect x="2" y="2" width="8" height="8" rx="2" fill="currentColor" opacity="0.9" />
    <rect x="14" y="2" width="8" height="8" rx="2" fill="currentColor" opacity="0.55" />
    <rect x="2" y="14" width="8" height="8" rx="2" fill="currentColor" opacity="0.55" />
    <rect x="14" y="14" width="8" height="8" rx="2" fill="currentColor" opacity="0.3" />
  </svg>
);

/**
 * Map provider/harness ids to display names + icons.
 * Provider identity = typography + icon, never brand color (DESIGN.md §2.5).
 */
export const PROVIDER_META = {
  claude: { label: 'Claude', Icon: IconAgent },
  codex: { label: 'Codex', Icon: IconTerminal },
  cursor: { label: 'Cursor', Icon: IconAgent },
  opencode: { label: 'OpenCode', Icon: IconTerminal },
  antigravity: { label: 'Antigravity', Icon: IconAgent },
  jules: { label: 'Jules', Icon: IconCloud },
  github: { label: 'GitHub', Icon: IconGitBranch },
  jira: { label: 'Jira', Icon: IconAlert },
  cloudflare: { label: 'Cloudflare', Icon: IconCloud },
};

export function providerMeta(id) {
  return (
    PROVIDER_META[id?.toLowerCase?.()] || {
      label: id || 'Unknown',
      Icon: IconAgent,
    }
  );
}
