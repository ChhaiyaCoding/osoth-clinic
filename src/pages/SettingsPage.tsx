import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { importCatalog, loadCatalog, type Catalog, type ImportResult } from '../db/catalog'
import { importTemplateCsv, parseImportFile, type ParsedFile } from '../db/fileImport'
import { applyMonographSeeds, loadMonographSeeds, type SeedResult } from '../db/monographSeed'
import { rebuildBatchQuantities } from '../db/stock'
import { BoxIcon, PillIcon } from '../components/icons'
import { BackupCard } from './BackupCard'

function Card({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card p-4">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  )
}

export function SettingsPage() {
  const { t } = useTranslation()

  return (
    <div className="space-y-4">
      <BackupCard />
      <BundledListCard />
      <FileImportCard />
      <MonographSeedCard />
      <StockIntegrityCard />
      <p className="px-1 text-xs leading-relaxed text-ink-3">{t('phase.settings')}</p>
    </div>
  )
}

function BundledListCard() {
  const { t } = useTranslation()
  const [catalog, setCatalog] = useState<Catalog>()
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ImportResult>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    loadCatalog().then(setCatalog).catch(() => setError(t('importer.failed')))
  }, [t])

  async function run() {
    if (!catalog) return
    setBusy(true)
    setError(undefined)
    try {
      setResult(await importCatalog(catalog.medicines))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('importer.failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title={t('importer.title')} icon={<BoxIcon />}>
      <p className="mt-2 text-sm leading-relaxed text-ink-2">{t('importer.body')}</p>

      {catalog && (
        <dl className="mt-3 space-y-1 panel text-sm">
          <div className="flex flex-wrap gap-x-2">
            <dt className="shrink-0 text-ink-3">{t('importer.sourceLabel')}:</dt>
            <dd className="min-w-0 text-ink-2">
              {catalog.source} ({catalog.version})
            </dd>
          </div>
          <div className="text-ink-2">{t('importer.preview', { count: catalog.medicines.length })}</div>
        </dl>
      )}

      <button
        type="button"
        onClick={run}
        disabled={!catalog || busy}
        className="btn btn-primary mt-4 w-full sm:w-auto"
      >
        {busy ? t('importer.importing') : t('importer.action')}
      </button>

      {error && <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">{error}</p>}
      {result && <ImportSummary result={result} />}
    </Card>
  )
}

function FileImportCard() {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const [parsed, setParsed] = useState<ParsedFile>()
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ImportResult>()
  const [error, setError] = useState<string>()

  function reset() {
    setParsed(undefined)
    setFileName('')
    setResult(undefined)
    setError(undefined)
    if (inputRef.current) inputRef.current.value = ''
  }

  async function onPick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setError(undefined)
    setResult(undefined)
    setFileName(file.name)
    try {
      setParsed(await parseImportFile(file))
    } catch (cause) {
      setParsed(undefined)
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  async function run() {
    if (!parsed) return
    setBusy(true)
    try {
      setResult(await importCatalog(parsed.entries))
      setParsed(undefined)
      if (inputRef.current) inputRef.current.value = ''
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  function downloadTemplate() {
    // A data: URL keeps this working offline — no server round trip.
    const link = document.createElement('a')
    link.href = `data:text/csv;charset=utf-8,﻿${encodeURIComponent(importTemplateCsv())}`
    link.download = 'medicine-import-template.csv'
    link.click()
  }

  return (
    <Card title={t('fileImport.title')} icon={<BoxIcon />}>
      <p className="mt-2 text-sm leading-relaxed text-ink-2">{t('fileImport.body')}</p>
      <p className="mt-2 text-xs leading-relaxed text-ink-3">{t('fileImport.columns')}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="btn btn-primary"
        >
          {t('fileImport.choose')}
        </button>
        <button
          type="button"
          onClick={downloadTemplate}
          className="btn btn-ghost"
        >
          {t('fileImport.template')}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.json,text/csv,application/json"
          onChange={onPick}
          className="hidden"
        />
      </div>

      {error && <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">{error}</p>}

      {parsed && (
        <div className="mt-3 space-y-2 panel text-sm">
          {parsed.entries.length === 0 ? (
            <p className="text-ink-2">{t('fileImport.nothing')}</p>
          ) : (
            <p className="font-medium text-ink">
              {t('fileImport.ready', { count: parsed.entries.length, name: fileName })}
            </p>
          )}

          {parsed.ignoredColumns.length > 0 && (
            <p className="text-xs text-ink-3">
              {t('fileImport.ignored', { list: parsed.ignoredColumns.join(', ') })}
            </p>
          )}

          {parsed.issues.length > 0 && (
            <details className="text-xs text-warn-ink">
              <summary className="cursor-pointer">
                {t('fileImport.issues', { count: parsed.issues.length })}
              </summary>
              <ul className="mt-1 space-y-0.5">
                {parsed.issues.slice(0, 50).map((issue) => (
                  <li key={`${issue.line}-${issue.message}`}>
                    #{issue.line} — {issue.message}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {parsed.entries.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={run}
                disabled={busy}
                className="btn btn-primary"
              >
                {busy ? t('importer.importing') : t('fileImport.confirm')}
              </button>
              <button
                type="button"
                onClick={reset}
                className="btn btn-ghost"
              >
                {t('fileImport.clear')}
              </button>
            </div>
          )}
        </div>
      )}

      {result && <ImportSummary result={result} />}
    </Card>
  )
}

function MonographSeedCard() {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<SeedResult>()
  const [error, setError] = useState<string>()

  async function run() {
    setBusy(true)
    setError(undefined)
    try {
      setResult(await applyMonographSeeds(await loadMonographSeeds()))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title={t('seeds.title')} icon={<PillIcon />}>
      <p className="mt-2 text-sm leading-relaxed text-ink-2">{t('seeds.body')}</p>

      <p className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-sm leading-relaxed text-warn-ink">
        {t('seeds.warning')}
      </p>

      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="btn btn-primary mt-4 w-full sm:w-auto"
      >
        {busy ? t('importer.importing') : t('seeds.action')}
      </button>

      {error && <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">{error}</p>}

      {result && (
        <p className="mt-3 rounded-lg bg-brand-soft px-3 py-2 text-sm text-brand-ink">
          {t('seeds.result', { matched: result.drugsMatched, updated: result.drugsUpdated })}
        </p>
      )}
    </Card>
  )
}

/**
 * Makes good on the append-only design: the movement ledger is authoritative,
 * so a cached batch total can always be recomputed from it.
 */
function StockIntegrityCard() {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ checked: number; corrected: number }>()

  return (
    <Card title={t('stock.integrity.title')} icon={<BoxIcon />}>
      <p className="mt-2 text-sm leading-relaxed text-ink-2">{t('stock.integrity.body')}</p>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          try {
            setResult(await rebuildBatchQuantities())
          } finally {
            setBusy(false)
          }
        }}
        className="btn btn-primary mt-4 w-full sm:w-auto"
      >
        {busy ? t('importer.importing') : t('stock.integrity.action')}
      </button>

      {result && (
        <p
          className={`mt-3 rounded-lg px-3 py-2 text-sm ${
            result.corrected > 0 ? 'bg-warn-soft text-warn-ink' : 'bg-brand-soft text-brand-ink'
          }`}
        >
          {result.corrected > 0
            ? t('stock.integrity.fixed', result)
            : t('stock.integrity.clean', result)}
        </p>
      )}
    </Card>
  )
}

function ImportSummary({ result }: { result: ImportResult }) {
  const { t } = useTranslation()
  return (
    <div className="mt-3 rounded-lg bg-brand-soft px-3 py-2 text-sm text-brand-ink">
      <p className="font-medium">{t('importer.resultTitle')}</p>
      <ul className="mt-1 space-y-0.5">
        <li>
          {t('importer.added')}: {result.added}
        </li>
        <li>
          {t('importer.updated')}: {result.updated}
        </li>
        {result.skipped > 0 && (
          <li>
            {t('importer.skipped')}: {result.skipped}
          </li>
        )}
      </ul>
    </div>
  )
}
