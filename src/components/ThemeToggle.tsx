import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getThemeMode, setThemeMode, THEME_MODES, type ThemeMode } from '../lib/theme'
import { MoonIcon, SunIcon, SystemIcon } from './icons'

const ICONS = { system: SystemIcon, light: SunIcon, dark: MoonIcon }

/** Cycles system → light → dark, showing the mode currently in force. */
export function ThemeToggle() {
  const { t } = useTranslation()
  const [mode, setMode] = useState<ThemeMode>(getThemeMode)

  const Icon = ICONS[mode]
  const next = THEME_MODES[(THEME_MODES.indexOf(mode) + 1) % THEME_MODES.length]

  return (
    <button
      type="button"
      onClick={() => {
        setThemeMode(next)
        setMode(next)
      }}
      aria-label={`${t('theme.label')}: ${t(`theme.${mode}`)}`}
      title={t(`theme.${mode}`)}
      className="rounded-xl p-2 text-on-header/75 transition hover:bg-black/10 hover:text-on-header"
    >
      <Icon />
    </button>
  )
}
