import { forwardRef } from 'react';
import { IconProps } from './Icons';

// Helper to make custom duck icons
function makeDuckIcon(name: string, paths: React.ReactNode) {
  const Icon = forwardRef<SVGSVGElement, IconProps>(function Icon(
    { size = 20, color = 'currentColor', title, ...rest },
    ref,
  ) {
    const labelled = Boolean(title);
    return (
      <svg
        ref={ref}
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        role={labelled ? 'img' : 'presentation'}
        aria-hidden={labelled ? undefined : true}
        focusable="false"
        {...rest}
      >
        {labelled ? <title>{title}</title> : null}
        {paths}
      </svg>
    );
  });
  Icon.displayName = `DuckIcon.${name}`;
  return Icon;
}

export const DuckInboxIcon = makeDuckIcon(
  'Inbox',
  <>
    <path d="M2 14 L22 14 L22 21 L2 21 Z" />
    <path d="M16 14 C16 3 6 3 6 10 L2 10 L4 13 L6 13" />
    <circle cx="11" cy="8" r="1.2" fill="currentColor" stroke="none" />
    <path d="M18 4 L18 10 M15 7 L18 10 L21 7" />
  </>
);

export const DuckSendIcon = makeDuckIcon(
  'Send',
  <>
    <path d="M21 3 L11 13" />
    <path d="M21 3 L15 21 L11 13 L3 9 Z" />
    <path d="M8 12 C8 2 18 2 18 8 L22 8 L20 11 L18 11" />
    <circle cx="13" cy="6.5" r="1.2" fill="currentColor" stroke="none" />
  </>
);

export const DuckDraftIcon = makeDuckIcon(
  'Draft',
  <>
    <path d="M14 3 H6 A2 2 0 0 0 4 5 V19 A2 2 0 0 0 6 21 H18 A2 2 0 0 0 20 19 V9 L14 3 Z" />
    <path d="M14 3 V9 H20" />
    <path d="M17 21 C17 10 7 10 7 16 L3 16 L5 19 L7 19" />
    <circle cx="12" cy="14.5" r="1.2" fill="currentColor" stroke="none" />
  </>
);

export const DuckArchiveIcon = makeDuckIcon(
  'Archive',
  <>
    <rect x="3" y="13" width="18" height="4" rx="1" />
    <path d="M5 17 V20 A2 2 0 0 0 7 22 H17 A2 2 0 0 0 19 20 V17" />
    <path d="M16 13 C16 2 6 2 6 8 L2 8 L4 11 L6 11" />
    <circle cx="11" cy="7" r="1.2" fill="currentColor" stroke="none" />
  </>
);

export const DuckTrashIcon = makeDuckIcon(
  'Trash',
  <>
    <path d="M3 6 H21" />
    <path d="M19 6 V20 A2 2 0 0 1 17 22 H7 A2 2 0 0 1 5 20 V6" />
    <path d="M8 6 V4 A2 2 0 0 1 10 2 H14 A2 2 0 0 1 16 4 V6" />
    <path d="M16 21 C16 10 6 10 6 17 L2 17 L4 20 L6 20" />
    <circle cx="11" cy="15" r="1.2" fill="currentColor" stroke="none" />
  </>
);

export const DuckFolderIcon = makeDuckIcon(
  'Folder',
  <>
    <path d="M3 7 A2 2 0 0 1 5 5 H9 L11 8 H20 A2 2 0 0 1 22 10 V19 A2 2 0 0 1 20 21 H5 A2 2 0 0 1 3 19 Z" />
    <path d="M16 20 C16 9 6 9 6 16 L2 16 L4 19 L6 19" />
    <circle cx="11" cy="14" r="1.2" fill="currentColor" stroke="none" />
  </>
);
