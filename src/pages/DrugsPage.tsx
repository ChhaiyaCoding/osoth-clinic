import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { deleteDrug, drugDisplayName, searchDrugs } from '../db/drugs'
import type { Drug } from '../db/types'
import type { Language } from '../i18n'
import { DrugFormModal } from './DrugForm'
import { Modal } from '../components/Modal'
import { EditIcon, LockIcon, PlusIcon, SearchIcon, TrashIcon } from '../components/icons'

export function DrugsPage() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as Language

  const [query, setQuery] = useState('')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [editing, setEditing] = useState<Drug | undefined>()
  const [formOpen, setFormOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Drug | undefined>()

  // Re-runs by itself whenever the drugs table changes — no manual refresh needed.
  const drugs = useLiveQuery(
    () => searchDrugs(query, { includeArchived, lang }),
    [query, includeArchived, lang],
  )

  function openAdd() {
    setEditing(undefined)
    setFormOpen(true)
  }

  function openEdit(drug: Drug) {
    setEditing(drug)
    setFormOpen(true)
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    await deleteDrug(pendingDelete.id)
    setPendingDelete(undefined)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input
            className="field pl-10"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('drug.searchPlaceholder')}
            aria-label={t('common.search')}
          />
        </div>
        <button onClick={openAdd} className="btn btn-primary">
          <PlusIcon />
          {t('common.add')}
        </button>
      </div>

      <div className="flex items-center justify-between gap-3 text-sm text-ink-2">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(event) => setIncludeArchived(event.target.checked)}
            className="size-4 rounded border-line-strong text-brand-ink focus:ring-brand"
          />
          {t('drug.showArchived')}
        </label>
        {drugs && <span>{t('drug.count', { count: drugs.length })}</span>}
      </div>

      {drugs === undefined ? (
        <p className="py-12 text-center text-ink-3">{t('common.loading')}</p>
      ) : drugs.length === 0 ? (
        <EmptyState query={query} />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {drugs.map((drug) => (
            <DrugCard
              key={drug.id}
              drug={drug}
              lang={lang}
              onEdit={() => openEdit(drug)}
              onDelete={() => setPendingDelete(drug)}
            />
          ))}
        </ul>
      )}

      <DrugFormModal open={formOpen} drug={editing} onClose={() => setFormOpen(false)} />

      <Modal
        open={pendingDelete !== undefined}
        title={t('drug.confirmDelete', {
          name: pendingDelete ? drugDisplayName(pendingDelete, lang) : '',
        })}
        onClose={() => setPendingDelete(undefined)}
        size="compact"
        footer={
          <>
            <button
              type="button"
              onClick={() => setPendingDelete(undefined)}
              className="btn btn-ghost"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={confirmDelete}
              className="btn btn-danger"
            >
              {t('common.delete')}
            </button>
          </>
        }
      >
        <p className="text-ink-2">{t('drug.confirmDeleteBody')}</p>
      </Modal>
    </div>
  )
}

function DrugCard({
  drug,
  lang,
  onEdit,
  onDelete,
}: {
  drug: Drug
  lang: Language
  onEdit: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const primary = drugDisplayName(drug, lang)
  // Imported drugs often have no Khmer name yet, and the fallback would make the
  // second line repeat the first. Only show it when it says something new.
  const other = lang === 'km' ? drug.nameEn : drug.nameKh
  const secondary = other && other !== primary ? other : null

  return (
    // `min-w-0` matters: without it a long unbroken medicine name makes the grid
    // track wider than the viewport and the whole page scrolls sideways.
    <li className="flex min-w-0 items-start gap-3 card p-3 transition hover:border-brand-line">
      {/* The whole card body opens the monograph; the icon buttons sit outside
          the link so they stay independently tappable. */}
      <Link to={`/drugs/${drug.id}`} className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="font-medium break-words text-ink">{primary}</h3>
          {drug.strength && <span className="text-sm text-ink-3">{drug.strength}</span>}
          {drug.isControlled && (
            <LockIcon width={15} height={15} className="text-warn-ink" aria-label={t('drug.fields.isControlled')} />
          )}
          {drug.isArchived && (
            <span className="chip">
              {t('drug.fields.isArchived')}
            </span>
          )}
        </div>

        {secondary && <p className="truncate text-sm text-ink-3">{secondary}</p>}
        {drug.nameJa && (
          <p lang="ja" className="truncate text-sm text-ink-3">
            {drug.nameJa}
          </p>
        )}

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
          <span className="chip font-mono">{drug.code}</span>
          <span>{drug.formLabel || t(`form.${drug.form}`)}</span>
          {drug.unit && <span>{drug.unit}</span>}
          {drug.sellPrice > 0 && (
            <span className="font-medium text-ink-2">{drug.sellPrice.toFixed(2)}</span>
          )}
        </div>
      </Link>

      <div className="flex shrink-0 gap-1">
        <button
          type="button"
          onClick={onEdit}
          aria-label={t('common.edit')}
          className="icon-btn hover:text-brand-ink"
        >
          <EditIcon />
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={t('common.delete')}
          className="icon-btn hover:bg-danger-soft hover:text-danger-ink"
        >
          <TrashIcon />
        </button>
      </div>
    </li>
  )
}

function EmptyState({ query }: { query: string }) {
  const { t } = useTranslation()
  return (
    <div className="rounded-xl border border-dashed border-line-strong px-6 py-14 text-center">
      <p className="font-medium text-ink-2">
        {query ? t('drug.noResults', { query }) : t('drug.empty')}
      </p>
      {!query && <p className="mt-1 text-sm text-ink-3">{t('drug.emptyHint')}</p>}
    </div>
  )
}
