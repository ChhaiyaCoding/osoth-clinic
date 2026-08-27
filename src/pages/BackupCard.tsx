import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import {
  BackupFormatError,
  createBackup,
  getLastBackupAt,
  getStorageStatus,
  readBackupFile,
  restoreBackup,
  saveBackupToDevice,
  type BackupFile,
  type RestoreMode,
  type RestoreResult,
  type StorageStatus,
} from '../db/backup'
import { Modal } from '../components/Modal'
import { BoxIcon } from '../components/icons'

/**
 * "390 medicines, 12 patients" — only the tables that actually hold something.
 * Labels are passed in rather than looked up here, because i18next's typed
 * `t` cannot be narrowed to a plain `(key: string) => string`.
 */
function describeCounts(
  counts: Record<string, number>,
  labels: Record<string, string>,
  empty: string,
): string {
  const parts = Object.entries(counts)
    .filter(([key, n]) => n > 0 && labels[key])
    .map(([key, n]) => `${n} ${labels[key]}`)
  return parts.length > 0 ? parts.join(', ') : empty
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

export function BackupCard() {
  const { t, i18n } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)

  const [lastBackupAt, setLastBackupAt] = useState<string>()
  const [storage, setStorage] = useState<StorageStatus>()

  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string>()
  const [error, setError] = useState<string>()

  const [incoming, setIncoming] = useState<BackupFile>()
  const [mode, setMode] = useState<RestoreMode>('merge')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [result, setResult] = useState<RestoreResult>()

  const countLabels = {
    drugs: t('nav.drugs'),
    batches: t('nav.stock'),
    patients: t('nav.patients'),
  }
  const describe = (counts: Record<string, number>) =>
    describeCounts(counts, countLabels, t('common.none'))

  // Live, so importing in another card updates this immediately — and cheap,
  // unlike counting by building a whole backup.
  const currentCounts = useLiveQuery(async () => ({
    drugs: await db.drugs.count(),
    batches: await db.batches.count(),
    patients: await db.patients.count(),
  }))

  const refresh = useCallback(async () => {
    setLastBackupAt(await getLastBackupAt())
    setStorage(await getStorageStatus())
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function exportNow() {
    setBusy(true)
    setError(undefined)
    setNotice(undefined)
    try {
      await saveBackupToDevice(await createBackup())
      setNotice(t('backup.exported'))
      await refresh()
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') setNotice(t('backup.cancelled'))
      else setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  async function pickFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setError(undefined)
    setNotice(undefined)
    setResult(undefined)
    try {
      setIncoming(await readBackupFile(file))
    } catch (cause) {
      setIncoming(undefined)
      setError(
        cause instanceof BackupFormatError
          ? t(`backup.errors.${cause.message}` as 'backup.errors.notJson')
          : cause instanceof Error
            ? cause.message
            : String(cause),
      )
    } finally {
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function runRestore() {
    if (!incoming) return
    setConfirmOpen(false)
    setBusy(true)
    try {
      setResult(await restoreBackup(incoming, mode))
      setIncoming(undefined)
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const overdueDays = lastBackupAt ? daysSince(lastBackupAt) : undefined

  return (
    <section className="card p-4">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <BoxIcon />
        {t('backup.title')}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-2">{t('backup.body')}</p>

      {/* Status: whether the browser will keep the data, and how stale the backup is. */}
      <div className="mt-3 space-y-1.5 panel text-sm">
        {currentCounts && (
          <p className="text-ink-2">{t('backup.contains', { list: describe(currentCounts) })}</p>
        )}

        {!lastBackupAt ? (
          <p className="font-medium text-warn-ink">⚠ {t('backup.never')}</p>
        ) : (
          <p className={overdueDays !== undefined && overdueDays >= 7 ? 'font-medium text-warn-ink' : 'text-ink-2'}>
            {overdueDays !== undefined && overdueDays >= 7
              ? `⚠ ${t('backup.overdue', { days: overdueDays })}`
              : t('backup.lastTaken', { when: new Date(lastBackupAt).toLocaleString(i18n.language) })}
          </p>
        )}

        {storage && (
          <>
            <p className={storage.persisted ? 'text-xs text-ink-3' : 'text-xs text-warn-ink'}>
              {storage.persisted ? `✓ ${t('backup.storagePersisted')}` : `⚠ ${t('backup.storageNotPersisted')}`}
            </p>
            {storage.usageBytes !== undefined && (
              <p className="text-xs text-ink-3">
                {t('backup.storageUsed', { size: formatBytes(storage.usageBytes) })}
              </p>
            )}
          </>
        )}
      </div>

      <button
        type="button"
        onClick={exportNow}
        disabled={busy}
        className="btn btn-primary mt-4 w-full sm:w-auto"
      >
        {busy ? t('backup.exporting') : t('backup.export')}
      </button>

      <hr className="my-4 border-line" />

      <h3 className="font-semibold">{t('backup.restoreTitle')}</h3>
      <p className="mt-1 text-sm leading-relaxed text-ink-2">{t('backup.restoreBody')}</p>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="btn btn-ghost mt-3"
      >
        {t('backup.choose')}
      </button>
      <input ref={inputRef} type="file" accept=".json,application/json" onChange={pickFile} className="hidden" />

      {incoming && (
        <div className="mt-3 space-y-3 panel text-sm">
          <p className="font-medium text-ink">
            {t('backup.fileSummary', {
              date: new Date(incoming.exportedAt).toLocaleDateString(i18n.language),
              list: describe(incoming.counts),
            })}
          </p>
          {currentCounts && (
            <p className="text-ink-2">
              {t('backup.currentSummary', { list: describe(currentCounts) })}
            </p>
          )}

          <fieldset className="space-y-2">
            <legend className="mb-1 font-medium text-ink-2">{t('backup.modeQuestion')}</legend>
            {(['merge', 'replace'] as const).map((option) => (
              <label
                key={option}
                className={`flex gap-2.5 rounded-lg border p-2.5 ${
                  mode === option ? 'border-brand bg-surface' : 'border-line'
                }`}
              >
                <input
                  type="radio"
                  name="restore-mode"
                  checked={mode === option}
                  onChange={() => setMode(option)}
                  className="mt-1 size-4 shrink-0 border-line-strong text-brand-ink focus:ring-brand"
                />
                <span className="min-w-0">
                  <span className="block font-medium text-ink">
                    {t(option === 'merge' ? 'backup.modeMerge' : 'backup.modeReplace')}
                  </span>
                  <span className="block text-xs leading-relaxed text-ink-2">
                    {t(option === 'merge' ? 'backup.modeMergeHint' : 'backup.modeReplaceHint')}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              // Replacing destroys data, so it goes through an explicit confirm.
              onClick={() => (mode === 'replace' ? setConfirmOpen(true) : void runRestore())}
              className={`btn text-white ${mode === 'replace' ? 'bg-danger hover:bg-danger-hover' : 'bg-brand hover:bg-brand'}`}
            >
              {busy ? t('backup.restoring') : t('backup.restore')}
            </button>
            <button
              type="button"
              onClick={() => setIncoming(undefined)}
              className="btn btn-ghost"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      {notice && <p className="mt-3 rounded-lg bg-brand-soft px-3 py-2 text-sm text-brand-ink">{notice}</p>}
      {error && <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">{error}</p>}

      {result && (
        <div className="mt-3 rounded-lg bg-brand-soft px-3 py-2 text-sm text-brand-ink">
          <p className="font-medium">{t('backup.restored')}</p>
          <ul className="mt-1 space-y-0.5">
            <li>
              {t('backup.added')}: {result.added}
            </li>
            {result.updated > 0 && (
              <li>
                {t('backup.updated')}: {result.updated}
              </li>
            )}
            {result.kept > 0 && (
              <li>
                {t('backup.kept')}: {result.kept}
              </li>
            )}
            {result.removed > 0 && (
              <li>
                {t('backup.removed')}: {result.removed}
              </li>
            )}
          </ul>
        </div>
      )}

      <Modal
        open={confirmOpen}
        size="compact"
        title={t('backup.confirmReplace')}
        onClose={() => setConfirmOpen(false)}
        footer={
          <>
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              className="btn btn-ghost"
            >
              {t('common.cancel')}
            </button>
            <button type="button" onClick={runRestore} className="btn btn-danger">
              {t('backup.restore')}
            </button>
          </>
        }
      >
        <p className="leading-relaxed text-ink-2">{t('backup.confirmReplaceBody')}</p>
      </Modal>
    </section>
  )
}
