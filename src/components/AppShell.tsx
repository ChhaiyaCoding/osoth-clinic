import type { ComponentType, SVGProps } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LanguageToggle } from './LanguageToggle'
import { ThemeToggle } from './ThemeToggle'
import { BoxIcon, ChartIcon, GearIcon, PillIcon, UsersIcon } from './icons'
import type { Translation } from '../i18n/locales/en'

interface NavItem {
  to: string
  labelKey: keyof Translation['nav']
  Icon: ComponentType<SVGProps<SVGSVGElement>>
}

const NAV: NavItem[] = [
  { to: '/drugs', labelKey: 'drugs', Icon: PillIcon },
  { to: '/stock', labelKey: 'stock', Icon: BoxIcon },
  { to: '/patients', labelKey: 'patients', Icon: UsersIcon },
  { to: '/reports', labelKey: 'reports', Icon: ChartIcon },
  { to: '/settings', labelKey: 'settings', Icon: GearIcon },
]

export function AppShell() {
  const { t } = useTranslation()

  return (
    <div className="min-h-dvh">
      {/* The header is a token of its own: brand-filled in light mode, an
          elevated neutral in dark, where a large saturated band would glare. */}
      <header className="sticky top-0 z-20 border-b border-header-line bg-header text-on-header">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-3">
          {/* Khmer stacks marks above and below the baseline; `leading-tight`
              clips them, so these keep a roomier line box. */}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold leading-snug">{t('app.title')}</h1>
            <p className="truncate text-xs leading-normal text-on-header/70">{t('app.subtitle')}</p>
          </div>
          <ThemeToggle />
          <LanguageToggle />
        </div>

        {/* Desktop navigation lives in the header; on phones it moves to the bottom bar. */}
        <nav className="mx-auto hidden max-w-5xl gap-1 px-3 md:flex">
          {NAV.map(({ to, labelKey, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-t-xl px-3.5 py-2.5 text-sm transition ${
                  isActive
                    ? 'bg-canvas font-medium text-brand-ink'
                    : 'text-on-header/70 hover:bg-black/10 hover:text-on-header'
                }`
              }
            >
              <Icon />
              {t(`nav.${labelKey}`)}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-4 pt-5 pb-28 md:pb-10">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/85 backdrop-blur-lg md:hidden">
        <div className="mx-auto flex max-w-5xl pb-[env(safe-area-inset-bottom)]">
          {NAV.map(({ to, labelKey, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `group flex flex-1 flex-col items-center gap-1 pt-2 pb-1.5 text-[11px] leading-normal transition ${
                  isActive ? 'text-brand-ink' : 'text-ink-3'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {/* A filled pill behind the icon marks the active tab far more
                      clearly than colour alone, which matters on a small screen. */}
                  <span
                    className={`rounded-full px-4 py-1 transition ${
                      isActive ? 'bg-brand-soft' : 'group-hover:bg-surface-2'
                    }`}
                  >
                    <Icon width={21} height={21} />
                  </span>
                  <span className={`truncate px-1 ${isActive ? 'font-medium' : ''}`}>
                    {t(`nav.${labelKey}`)}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
