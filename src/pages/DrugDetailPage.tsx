import { Link, Navigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { drugDisplayName, isSectionEmpty } from '../db/drugs'
import { MONOGRAPH_SECTIONS } from '../db/types'
import type { Language } from '../i18n'
import { DrugFormModal } from './DrugForm'
import { EditIcon, LockIcon } from '../components/icons'
import { ReviewBanner } from '../components/ReviewBanner'
import { StockLine } from '../components/StockLine'
import { useState } from 'react'

/**
 * The monograph landing page: identity at the top, then one row per section —
 * the same shape a clinician already knows from printed and online drug
 * references, so nothing has to be learned.
 */
export function DrugDetailPage() {
  const { id = '' } = useParams()
  const { t, i18n } = useTranslation()
  const lang = i18n.language as Language
  const [editOpen, setEditOpen] = useState(false)

  // `?? null` disambiguates the two undefined cases useLiveQuery would otherwise
  // collapse: still loading vs. no such drug.
  const drug = useLiveQuery(async () => (await db.drugs.get(id)) ?? null, [id])

  if (drug === undefined) return <p className="py-12 text-center text-ink-3">{t('common.loading')}</p>
  if (drug === null || drug.deletedAt) return <Navigate to="/drugs" replace />

  const primary = drugDisplayName(drug, lang)
  // Imported drugs often have no Khmer name yet, so the fallback would make the
  // second line repeat the first.
  const other = lang === 'km' ? drug.nameEn : drug.nameKh
  const secondary = other && other !== primary ? other : null

  return (
    <div className="space-y-4">
      <section className="card p-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h2 className="text-xl font-semibold break-words">{primary}</h2>
              <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs font-medium text-ink-2">
                {t(`drug.${drug.rxStatus}`)}
              </span>
              {drug.isControlled && <LockIcon width={16} height={16} className="text-warn-ink" />}
            </div>

            {secondary && <p className="text-ink-3">{secondary}</p>}
            {drug.nameJa && (
              <p lang="ja" className="text-ink-3">
                {drug.nameJa}
              </p>
            )}
            {drug.brandNames.length > 0 && (
              <p className="mt-1 text-sm text-ink-2">{drug.brandNames.join(', ')}</p>
            )}
            {drug.classes.length > 0 && (
              <p className="mt-1 text-sm text-ink-2">
                <span className="italic text-ink-3">{t('drug.fields.classes')}: </span>
                {drug.classes.join(', ')}
              </p>
            )}

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
              <span className="chip font-mono">{drug.code}</span>
              <span>{drug.formLabel || t(`form.${drug.form}`)}</span>
              {drug.strength && <span>{drug.strength}</span>}
              {drug.unit && <span>{drug.unit}</span>}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setEditOpen(true)}
            aria-label={t('common.edit')}
            className="icon-btn hover:text-brand-ink"
          >
            <EditIcon />
          </button>
        </div>

        {drug.note && (
          <p className="mt-3 whitespace-pre-line border-t border-line pt-3 text-sm leading-relaxed text-ink-2">
            {drug.note}
          </p>
        )}
      </section>

      <StockLine drug={drug} />

      <ReviewBanner drug={drug} />

      <nav className="card overflow-hidden">
        {MONOGRAPH_SECTIONS.map((section) => {
          const empty = isSectionEmpty(drug.monograph, section)
          return (
            <Link
              key={section}
              to={`/drugs/${drug.id}/${section}`}
              className="flex items-center gap-3 border-b border-line px-4 py-3.5 transition last:border-b-0 hover:bg-surface-2"
            >
              <span className={`flex-1 font-semibold ${empty ? 'text-ink-3' : 'text-ink'}`}>
                {t(`monograph.sections.${section}`)}
              </span>
              <span aria-hidden className="text-ink-3">
                ›
              </span>
            </Link>
          )
        })}
      </nav>

      <p className="px-1 text-xs leading-relaxed text-ink-3">{t('monograph.disclaimer')}</p>

      <DrugFormModal open={editOpen} drug={drug} onClose={() => setEditOpen(false)} />
    </div>
  )
}
