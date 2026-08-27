import { useTranslation } from 'react-i18next'
import { LANGUAGES, setLanguage, type Language } from '../i18n'

/** Two-way pill switch. Each label is written in its own language, never translated. */
export function LanguageToggle() {
  const { i18n, t } = useTranslation()
  const current = i18n.language as Language

  return (
    <div
      role="group"
      aria-label={t('lang.label')}
      className="flex shrink-0 items-center rounded-xl bg-black/10 p-0.5 text-sm"
    >
      {LANGUAGES.map((lang) => (
        <button
          key={lang}
          type="button"
          onClick={() => setLanguage(lang)}
          aria-pressed={current === lang}
          className={`rounded-lg px-2.5 py-1.5 leading-none transition ${
            current === lang ? 'bg-surface font-medium text-brand-ink shadow-[var(--shadow-card)]' : 'text-on-header/70 hover:text-on-header'
          }`}
        >
          {t(`lang.${lang}`)}
        </button>
      ))}
    </div>
  )
}
