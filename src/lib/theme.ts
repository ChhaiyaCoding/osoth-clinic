/**
 * Light / dark / follow-the-system.
 *
 * The chosen *mode* is stored, but what lands on <html> is always the resolved
 * theme — `data-theme="light"` or `"dark"`. Because the browser's own UI (form
 * controls, scrollbars, the PWA status bar) has to match too, the stylesheet
 * sets `color-scheme` per theme and this keeps the `theme-color` meta in step.
 */

export const THEME_MODES = ['system', 'light', 'dark'] as const
export type ThemeMode = (typeof THEME_MODES)[number]

const STORAGE_KEY = 'clinic.theme'

/** Must match --c-canvas in index.css, so the status bar blends with the page. */
const STATUS_BAR_COLOR: Record<'light' | 'dark', string> = {
  light: '#f4f6f9',
  dark: '#101725',
}

function isMode(value: unknown): value is ThemeMode {
  return THEME_MODES.includes(value as ThemeMode)
}

export function getThemeMode(): ThemeMode {
  const saved = localStorage.getItem(STORAGE_KEY)
  return isMode(saved) ? saved : 'system'
}

export function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode !== 'system') return mode
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(mode: ThemeMode): void {
  // Always stamp a concrete theme, never "system". That lets the stylesheet
  // carry a single dark palette instead of duplicating it inside a media query,
  // where the two copies would inevitably drift apart.
  const resolved = resolveTheme(mode)
  document.documentElement.setAttribute('data-theme', resolved)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', STATUS_BAR_COLOR[resolved])
}

export function setThemeMode(mode: ThemeMode): void {
  localStorage.setItem(STORAGE_KEY, mode)
  applyTheme(mode)
}

/**
 * Apply the stored choice before React renders, so the first paint is already
 * the right theme rather than flashing white.
 */
export function initTheme(): void {
  applyTheme(getThemeMode())
  // While following the system, track it live — the OS can switch at sunset.
  window
    .matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', () => {
      if (getThemeMode() === 'system') applyTheme('system')
    })
}
