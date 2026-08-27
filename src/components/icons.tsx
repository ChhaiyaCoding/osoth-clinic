/**
 * Inline SVG icons. Kept local rather than pulling an icon package so the
 * offline bundle stays small and there is no runtime font/sprite to fetch.
 */
import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      width={20}
      height={20}
      {...props}
    >
      {children}
    </svg>
  )
}

export const PillIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2.5" y="8.5" width="19" height="7" rx="3.5" transform="rotate(-45 12 12)" />
    <path d="M8.5 8.5 15.5 15.5" />
  </Icon>
)

export const BoxIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M21 8 12 3 3 8v8l9 5 9-5Z" />
    <path d="M3 8l9 5 9-5M12 13v8" />
  </Icon>
)

export const UsersIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M16 19v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V19" />
    <circle cx="9" cy="7" r="3.2" />
    <path d="M22 19v-1.5a4 4 0 0 0-3-3.87M16.5 4.3a3.2 3.2 0 0 1 0 5.4" />
  </Icon>
)

export const ChartIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 3v16.5A1.5 1.5 0 0 0 4.5 21H21" />
    <path d="M7 15l3.5-4 3 2.5L20 7" />
  </Icon>
)

export const GearIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6M18.7 18.7l-1.6-1.6M6.9 6.9 5.3 5.3" />
  </Icon>
)

export const PlusIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
)

export const SearchIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Icon>
)

export const EditIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Z" />
    <path d="m15 6 3 3" />
  </Icon>
)

export const TrashIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    <path d="M6 7v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7M10 11v6M14 11v6" />
  </Icon>
)

export const CloseIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 6 18 18M18 6 6 18" />
  </Icon>
)

export const SunIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M21.5 12h-2M4.5 12h-2M18.4 5.6l-1.4 1.4M7 17l-1.4 1.4M18.4 18.4L17 17M7 7 5.6 5.6" />
  </Icon>
)

export const MoonIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
  </Icon>
)

/** Half-filled disc: the theme follows whatever the device is set to. */
export const SystemIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 3.5a8.5 8.5 0 0 1 0 17Z" fill="currentColor" stroke="none" />
  </Icon>
)

export const LockIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4.5" y="10" width="15" height="10" rx="2" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </Icon>
)
