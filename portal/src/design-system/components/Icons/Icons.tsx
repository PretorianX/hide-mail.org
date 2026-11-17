import { SVGAttributes, forwardRef } from 'react';

export type IconSize = number | string;

export interface IconProps extends Omit<SVGAttributes<SVGSVGElement>, 'fill' | 'stroke'> {
  size?: IconSize;
  color?: string;
  title?: string;
}

interface InternalIconProps extends IconProps {
  children: React.ReactNode;
}

const BaseIcon = forwardRef<SVGSVGElement, InternalIconProps>(function BaseIcon(
  { size = 20, color = 'currentColor', title, children, ...rest },
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
      {children}
    </svg>
  );
});

function makeIcon(name: string, paths: React.ReactNode) {
  const Icon = forwardRef<SVGSVGElement, IconProps>(function Icon(props, ref) {
    return (
      <BaseIcon ref={ref} {...props}>
        {paths}
      </BaseIcon>
    );
  });
  Icon.displayName = `Icon.${name}`;
  return Icon;
}

export const PaperclipIcon = makeIcon(
  'Paperclip',
  <path d="M21 12.5l-8.5 8.5a5 5 0 1 1-7-7l9-9a3.5 3.5 0 1 1 5 5l-9 9a2 2 0 1 1-3-3l7.5-7.5" />,
);

export const StarIcon = makeIcon(
  'Star',
  <path d="M12 3.5l2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.9l6.1-.9z" />,
);

export const StarFilledIcon = makeIcon(
  'StarFilled',
  <path
    d="M12 3.5l2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.9l6.1-.9z"
    fill="currentColor"
  />,
);

export const MoreHorizontalIcon = makeIcon(
  'MoreHorizontal',
  <>
    <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
  </>,
);

export const MoreVerticalIcon = makeIcon(
  'MoreVertical',
  <>
    <circle cx="12" cy="5" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="12" cy="19" r="1.4" fill="currentColor" stroke="none" />
  </>,
);

export const ChevronDownIcon = makeIcon('ChevronDown', <path d="M6 9l6 6 6-6" />);
export const ChevronUpIcon = makeIcon('ChevronUp', <path d="M6 15l6-6 6 6" />);
export const ChevronLeftIcon = makeIcon('ChevronLeft', <path d="M15 6l-6 6 6 6" />);
export const ChevronRightIcon = makeIcon('ChevronRight', <path d="M9 6l6 6-6 6" />);

export const SearchIcon = makeIcon(
  'Search',
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3" />
  </>,
);

export const CloseIcon = makeIcon(
  'Close',
  <>
    <path d="M6 6l12 12" />
    <path d="M18 6L6 18" />
  </>,
);

export const PencilIcon = makeIcon(
  'Pencil',
  <>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
  </>,
);

export const InboxIcon = makeIcon(
  'Inbox',
  <>
    <path d="M3 13l3-7h12l3 7" />
    <path d="M3 13v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6" />
    <path d="M3 13h5l1 3h6l1-3h5" />
  </>,
);

export const SendIcon = makeIcon(
  'Send',
  <>
    <path d="M22 2L11 13" />
    <path d="M22 2l-7 20-4-9-9-4z" />
  </>,
);

export const DraftIcon = makeIcon(
  'Draft',
  <>
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
    <path d="M14 3v6h6" />
    <path d="M9 14h6" />
    <path d="M9 18h4" />
  </>,
);

export const ArchiveIcon = makeIcon(
  'Archive',
  <>
    <rect x="3" y="3" width="18" height="5" rx="1" />
    <path d="M5 8v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8" />
    <path d="M10 12h4" />
  </>,
);

export const TrashIcon = makeIcon(
  'Trash',
  <>
    <path d="M3 6h18" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
  </>,
);

export const FolderIcon = makeIcon(
  'Folder',
  <path d="M3 7a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
);

export const SettingsIcon = makeIcon(
  'Settings',
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1A2 2 0 1 1 7 4.6l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </>,
);

export const UserIcon = makeIcon(
  'User',
  <>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </>,
);

export const MailIcon = makeIcon(
  'Mail',
  <>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 7l9 6 9-6" />
  </>,
);

export const MailUnreadIcon = makeIcon(
  'MailUnread',
  <>
    <rect x="3" y="5" width="18" height="14" rx="2" fill="currentColor" stroke="none" />
    <path d="M3 7l9 6 9-6" stroke="white" />
  </>,
);

export const MailReadIcon = makeIcon(
  'MailRead',
  <>
    <path d="M3 9l9-6 9 6" />
    <path d="M3 9v8a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9" />
    <path d="M3 9l9 6 9-6" />
  </>,
);

export const ReplyIcon = makeIcon(
  'Reply',
  <>
    <path d="M9 17l-5-5 5-5" />
    <path d="M4 12h11a5 5 0 0 1 5 5v3" />
  </>,
);

export const ForwardIcon = makeIcon(
  'Forward',
  <>
    <path d="M15 17l5-5-5-5" />
    <path d="M20 12H9a5 5 0 0 0-5 5v3" />
  </>,
);

export const DownloadIcon = makeIcon(
  'Download',
  <>
    <path d="M12 3v12" />
    <path d="M7 10l5 5 5-5" />
    <path d="M5 21h14" />
  </>,
);

export const CheckIcon = makeIcon('Check', <path d="M4 12l5 5 11-12" />);

export const PlusIcon = makeIcon(
  'Plus',
  <>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </>,
);

export const MenuIcon = makeIcon(
  'Menu',
  <>
    <path d="M4 6h16" />
    <path d="M4 12h16" />
    <path d="M4 18h16" />
  </>,
);

export const RefreshIcon = makeIcon(
  'Refresh',
  <>
    <path d="M21 12a9 9 0 1 1-3.5-7.1" />
    <path d="M21 4v5h-5" />
  </>,
);

export const FilterIcon = makeIcon(
  'Filter',
  <path d="M4 5h16l-6 8v6l-4-2v-4z" />,
);

export const InfoIcon = makeIcon(
  'Info',
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8h.01" />
    <path d="M11 12h1v5h1" />
  </>,
);

export const WarningIcon = makeIcon(
  'Warning',
  <>
    <path d="M12 3l10 18H2z" />
    <path d="M12 9v5" />
    <path d="M12 18h.01" />
  </>,
);

export const ErrorIcon = makeIcon(
  'Error',
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v5" />
    <path d="M12 16h.01" />
  </>,
);

export const SuccessIcon = makeIcon(
  'Success',
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 12l3 3 5-6" />
  </>,
);

export const iconRegistry = {
  Paperclip: PaperclipIcon,
  Star: StarIcon,
  StarFilled: StarFilledIcon,
  MoreHorizontal: MoreHorizontalIcon,
  MoreVertical: MoreVerticalIcon,
  ChevronDown: ChevronDownIcon,
  ChevronUp: ChevronUpIcon,
  ChevronLeft: ChevronLeftIcon,
  ChevronRight: ChevronRightIcon,
  Search: SearchIcon,
  Close: CloseIcon,
  Pencil: PencilIcon,
  Inbox: InboxIcon,
  Send: SendIcon,
  Draft: DraftIcon,
  Archive: ArchiveIcon,
  Trash: TrashIcon,
  Folder: FolderIcon,
  Settings: SettingsIcon,
  User: UserIcon,
  Mail: MailIcon,
  MailUnread: MailUnreadIcon,
  MailRead: MailReadIcon,
  Reply: ReplyIcon,
  Forward: ForwardIcon,
  Download: DownloadIcon,
  Check: CheckIcon,
  Plus: PlusIcon,
  Menu: MenuIcon,
  Refresh: RefreshIcon,
  Filter: FilterIcon,
  Info: InfoIcon,
  Warning: WarningIcon,
  Error: ErrorIcon,
  Success: SuccessIcon,
} as const;

export type IconName = keyof typeof iconRegistry;
