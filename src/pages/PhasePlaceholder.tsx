import { useTranslation } from 'react-i18next'
import type { Translation } from '../i18n/locales/en'

/** Stand-in for a section that lands in a later phase, so the nav is never dead. */
export function PhasePlaceholder({ messageKey }: { messageKey: keyof Translation['phase'] }) {
  const { t } = useTranslation()
  return (
    <div className="rounded-xl border border-dashed border-line-strong px-6 py-16 text-center">
      <p className="font-medium text-ink-2">{t('phase.soon')}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-ink-3">{t(`phase.${messageKey}`)}</p>
    </div>
  )
}
