import { useTranslation } from 'react-i18next'
import { markMonographReviewed } from '../db/monographSeed'
import type { Drug } from '../db/types'

/**
 * Shown on any monograph the clinic did not write itself, until a pharmacist
 * confirms it. Imported reference text must never be mistaken for a checked
 * local protocol — paediatric dosing especially.
 */
export function ReviewBanner({ drug }: { drug: Drug }) {
  const { t, i18n } = useTranslation()

  if (!drug.monographSource) return null

  if (drug.monographReviewedAt) {
    return (
      <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-ink-2">
        {t('review.reviewedOn', {
          date: new Date(drug.monographReviewedAt).toLocaleDateString(i18n.language),
        })}
      </p>
    )
  }

  return (
    <div className="rounded-lg border border-warn-line bg-warn-soft px-3 py-2.5">
      <p className="font-medium text-warn-ink">⚠ {t('review.unverified')}</p>
      <p className="mt-1 text-sm leading-relaxed text-warn-ink">
        {t('review.unverifiedBody', { source: drug.monographSource })}
      </p>
      <button
        type="button"
        onClick={() => void markMonographReviewed(drug.id)}
        className="btn mt-2 bg-warn text-on-brand hover:brightness-95"
      >
        {t('review.markReviewed')}
      </button>
    </div>
  )
}
