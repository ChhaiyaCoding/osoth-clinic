import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { isSectionEmpty, newBlock, pruneBlocks, updateMonograph } from '../db/drugs'
import {
  MONOGRAPH_SECTIONS,
  PREGNANCY_CATEGORIES,
  type DoseAudience,
  type MonographBlock,
  type MonographSectionKey,
  type PregnancyCategory,
} from '../db/types'
import { EditIcon, PlusIcon, TrashIcon } from '../components/icons'
import { ReviewBanner } from '../components/ReviewBanner'

function isSectionKey(value: string): value is MonographSectionKey {
  return (MONOGRAPH_SECTIONS as readonly string[]).includes(value)
}

export function MonographSectionPage() {
  const { id = '', section = '' } = useParams()
  const { t } = useTranslation()

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<MonographBlock[]>([])
  // Pregnancy's category and lactation text ride in the same draft as the
  // blocks, so one Save commits the section and Cancel discards all of it.
  const [pregnancyDraft, setPregnancyDraft] = useState({
    pregnancyCategory: 'NA' as PregnancyCategory,
    lactation: '',
  })
  const [audience, setAudience] = useState<DoseAudience>('adult')

  const drug = useLiveQuery(async () => (await db.drugs.get(id)) ?? null, [id])

  // Leave edit mode when navigating between sections, so an unsaved draft from
  // one section can never be written onto another.
  useEffect(() => {
    setEditing(false)
  }, [id, section])

  if (!isSectionKey(section)) return <Navigate to={`/drugs/${id}`} replace />
  if (drug === undefined) return <p className="py-12 text-center text-ink-3">{t('common.loading')}</p>
  if (drug === null || drug.deletedAt) return <Navigate to="/drugs" replace />

  const monograph = drug.monograph
  const blocks = monograph[section]
  const index = MONOGRAPH_SECTIONS.indexOf(section)
  const previous = MONOGRAPH_SECTIONS[index - 1]
  const next = MONOGRAPH_SECTIONS[index + 1]

  const isDosage = section === 'dosage'
  const shown = isDosage ? blocks.filter((block) => (block.audience ?? 'adult') === audience) : blocks

  function startEditing() {
    // Editing works on a copy; nothing reaches the database until Save.
    setDraft(blocks.length > 0 ? structuredClone(blocks) : [newBlock(isDosage ? audience : undefined)])
    setPregnancyDraft({
      pregnancyCategory: monograph.pregnancyCategory,
      lactation: monograph.lactation,
    })
    setEditing(true)
  }

  async function save() {
    const patch: Parameters<typeof updateMonograph>[1] = { [section]: pruneBlocks(draft) }
    if (section === 'pregnancy') Object.assign(patch, pregnancyDraft)
    await updateMonograph(id, patch)
    setEditing(false)
  }

  return (
    <div className="space-y-4">
      <nav className="flex items-center gap-2 text-sm">
        <Link to={`/drugs/${id}`} className="shrink-0 font-medium text-brand-ink hover:underline">
          ‹ {t('monograph.title')}
        </Link>
        <span className="min-w-0 flex-1 truncate text-right text-ink-3">
          {previous && (
            <Link to={`/drugs/${id}/${previous}`} className="hover:underline">
              {t(`monograph.sections.${previous}`)}
            </Link>
          )}
          {previous && next && <span className="px-2 text-ink-3">|</span>}
          {next && (
            <Link to={`/drugs/${id}/${next}`} className="hover:underline">
              {t(`monograph.sections.${next}`)}
            </Link>
          )}
        </span>
      </nav>

      <div className="flex items-center gap-3">
        <h2 className="min-w-0 flex-1 text-2xl font-bold">{t(`monograph.sections.${section}`)}</h2>
        {editing ? (
          <>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="btn btn-ghost"
            >
              {t('common.cancel')}
            </button>
            <button type="button" onClick={save} className="btn btn-primary">
              {t('common.save')}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={startEditing}
            className="btn btn-ghost"
          >
            <EditIcon />
            {t('common.edit')}
          </button>
        )}
      </div>

      {isDosage && (
        <div className="flex gap-2">
          {(['adult', 'pediatric'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setAudience(option)}
              aria-pressed={audience === option}
              className={`btn flex-1 ${
                audience === option ? 'bg-brand text-white' : 'bg-surface-3 text-ink-2'
              }`}
            >
              {t(`monograph.${option}`)}
            </button>
          ))}
        </div>
      )}

      <ReviewBanner drug={drug} />

      {section === 'pregnancy' && (
        <PregnancyPanel
          category={editing ? pregnancyDraft.pregnancyCategory : monograph.pregnancyCategory}
          lactation={editing ? pregnancyDraft.lactation : monograph.lactation}
          editing={editing}
          onChange={(patch) => setPregnancyDraft((prev) => ({ ...prev, ...patch }))}
        />
      )}

      {section === 'interactions' && !editing && (
        <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn-ink">
          {t('monograph.interactionsNote')}
        </p>
      )}

      {editing ? (
        <BlockEditor
          blocks={draft}
          audience={isDosage ? audience : undefined}
          onChange={setDraft}
        />
      ) : shown.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-strong px-6 py-12 text-center">
          <p className="font-medium text-ink-2">{t('monograph.empty')}</p>
          <p className="mt-1 text-sm text-ink-3">{t('monograph.emptyHint')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map((block) => (
            <section key={block.id} className="overflow-hidden rounded-xl border border-line bg-surface">
              {block.heading && (
                <h3 className="border-b border-line bg-surface-2 px-4 py-2.5 font-semibold">
                  {block.heading}
                </h3>
              )}
              <ul>
                {block.items.map((item, i) => (
                  <li key={i} className="border-b border-line px-4 py-2.5 last:border-b-0">
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {!editing && !isSectionEmpty(monograph, section) && (
        <p className="px-1 text-xs leading-relaxed text-ink-3">{t('monograph.disclaimer')}</p>
      )}
    </div>
  )
}

function PregnancyPanel({
  category,
  lactation,
  editing,
  onChange,
}: {
  category: PregnancyCategory
  lactation: string
  editing: boolean
  onChange: (patch: { pregnancyCategory?: PregnancyCategory; lactation?: string }) => void
}) {
  const { t } = useTranslation()

  return (
    <section className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-ink-2">
          {t('monograph.pregnancyCategory')}
        </span>
        {editing ? (
          <select
            className="field"
            value={category}
            onChange={(event) => onChange({ pregnancyCategory: event.target.value as PregnancyCategory })}
          >
            {PREGNANCY_CATEGORIES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        ) : (
          <p className="text-lg font-semibold">{category}</p>
        )}
        <span className="mt-1 block text-sm leading-relaxed text-ink-2">
          {t(`monograph.categories.${category}`)}
        </span>
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-ink-2">{t('monograph.lactation')}</span>
        {editing ? (
          <textarea
            className="field min-h-20"
            value={lactation}
            placeholder={t('monograph.lactationPlaceholder')}
            onChange={(event) => onChange({ lactation: event.target.value })}
          />
        ) : (
          <p className="text-ink-2">{lactation || t('common.none')}</p>
        )}
      </label>
    </section>
  )
}

function BlockEditor({
  blocks,
  audience,
  onChange,
}: {
  blocks: MonographBlock[]
  /** Set for the dosage section, so new blocks land under the open tab. */
  audience?: DoseAudience
  onChange: (blocks: MonographBlock[]) => void
}) {
  const { t } = useTranslation()

  // In the dosage section only the open tab's blocks are editable, but the
  // other tab's blocks must survive the save untouched.
  const visible = audience ? blocks.filter((b) => (b.audience ?? 'adult') === audience) : blocks

  function replace(id: string, updater: (block: MonographBlock) => MonographBlock) {
    onChange(blocks.map((block) => (block.id === id ? updater(block) : block)))
  }

  return (
    <div className="space-y-3">
      {visible.map((block) => (
        <section key={block.id} className="space-y-2 rounded-xl border border-line bg-surface p-3">
          <div className="flex items-center gap-2">
            <input
              className="field font-semibold"
              value={block.heading}
              placeholder={t('monograph.headingPlaceholder')}
              onChange={(event) => replace(block.id, (b) => ({ ...b, heading: event.target.value }))}
            />
            <button
              type="button"
              onClick={() => onChange(blocks.filter((b) => b.id !== block.id))}
              aria-label={t('monograph.removeBlock')}
              className="icon-btn shrink-0 hover:bg-danger-soft hover:text-danger-ink"
            >
              <TrashIcon />
            </button>
          </div>

          {block.items.map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                className="field"
                value={item}
                placeholder={t('monograph.itemPlaceholder')}
                onChange={(event) =>
                  replace(block.id, (b) => ({
                    ...b,
                    items: b.items.map((old, j) => (j === i ? event.target.value : old)),
                  }))
                }
              />
              <button
                type="button"
                onClick={() =>
                  replace(block.id, (b) => ({ ...b, items: b.items.filter((_, j) => j !== i) }))
                }
                aria-label={t('monograph.removeItem')}
                className="icon-btn shrink-0 hover:bg-danger-soft hover:text-danger-ink"
              >
                <TrashIcon width={16} height={16} />
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={() => replace(block.id, (b) => ({ ...b, items: [...b.items, ''] }))}
            className="btn btn-soft w-full"
          >
            <PlusIcon width={16} height={16} />
            {t('monograph.addItem')}
          </button>
        </section>
      ))}

      <button
        type="button"
        onClick={() => onChange([...blocks, newBlock(audience)])}
        className="btn w-full bg-brand-soft text-brand-ink ring-1 ring-brand-line hover:brightness-95"
      >
        <PlusIcon />
        {t('monograph.addBlock')}
      </button>
    </div>
  )
}
