# ប្រព័ន្ធគ្រប់គ្រងឱសថ — Clinic Pharmacy Manager

PWA គ្រប់គ្រងឱសថសម្រាប់គ្លីនិក/មន្ទីរពេទ្យតូច។ ដំណើរការពេញលេញដោយគ្មានអ៊ីនធឺណិត
(offline-first) និងគាំទ្រពីរភាសា ខ្មែរ + អង់គ្លេស។

An offline-first PWA for small clinic pharmacies. Bilingual Khmer/English.

## ដំណើរការ / Running

```bash
npm install
```

```bash
npm run dev
```

| Command | អ្វី / What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Type-check + production build into `dist/` |
| `npm run preview` | Serve `dist/` — use this to test the service worker |
| `npm run lint` | oxlint |
| `npm run icons` | Regenerate the PWA icons in `public/` |

Service workers only run over `http://localhost` or HTTPS, so offline behaviour
must be tested through `npm run preview`, not `npm run dev`.

## ដាក់ឲ្យប្រើ / Deploying

The app is a folder of static files with no backend, so any static host works.

```bash
npm run build
```

Then publish `dist/`. Hash routing means **no rewrite rules are needed** — the
usual SPA "redirect everything to index.html" config is unnecessary.

| Host | Base path |
| --- | --- |
| GitHub Pages (project site) | `BASE_PATH=/<repo>/ npm run build` |
| Cloudflare Pages, Netlify, Vercel | default (`/`) — nothing to set |

### Live site

**https://chhaiyacoding.github.io/osoth-clinic/**

`.github/workflows/deploy.yml` builds and publishes to GitHub Pages on every
push to `main`, setting `BASE_PATH` from the repository name automatically, so
deploying is just:

```bash
git push
```

Use the Actions tab (or `gh workflow run deploy.yml`) to re-publish without a
commit.

GitHub Pages on the free plan requires a **public** repository — which is why
this one is public. Nothing clinical lives here: the repository holds only the
app's code and the published ACMC reference list. Every patient, prescription,
stock and price record stays in the browser's own IndexedDB on the clinic's
device and is never uploaded anywhere.

Pages serves `sw.js` with a short cache lifetime of its own, so installed phones
pick up new builds; the content-hashed files under `assets/` are immutable and
cached indefinitely.

### Phones on the local network

```bash
npm run preview:lan
```

Serves the built app on the Mac's LAN address. Useful for a quick look, but
plain `http://` on a LAN IP is not a secure context, so **the service worker
does not register and the app will not work offline or install as a real PWA**.
Use a real HTTPS host for anything beyond a glance.

## ស្ថាបត្យកម្ម / Architecture

| ផ្នែក | ជម្រើស |
| --- | --- |
| UI | React 19 + TypeScript + Vite |
| Styling | Tailwind CSS v4 |
| Storage | IndexedDB via Dexie — no server, no network |
| PWA | `vite-plugin-pwa` (Workbox), everything precached |
| i18n | `react-i18next`, Khmer default |
| Routing | `HashRouter`, so any static host works with no rewrite rules |

```
src/
  db/
    types.ts    Domain model — every table, including the later phases
    db.ts       Dexie schema + storage persistence request
    drugs.ts    Drug repository: search, CRUD, display names
  i18n/
    locales/    en.ts is the source of truth; km.ts is typed against it
  lib/
    search.ts   Khmer-aware normalization, tokenizing and sorting
  components/   AppShell, Modal, LanguageToggle, ThemeToggle, ExpiryBadge, icons
  pages/        DrugsPage, DrugDetailPage, MonographSectionPage,
                StockPage, DrugStockPage, ReceiveStockModal,
                SettingsPage, BackupCard, DrugForm, PhasePlaceholder
```

### Monograph

Each drug carries a clinical monograph with the eight sections a drug reference
normally has: Dosage & Indications, Interactions, Adverse Effects, Warnings,
Pregnancy, Pharmacology, Administration, Formulary.

Every section is the *same* shape — a list of headed blocks (`MonographBlock`:
one heading plus a list of lines) — so a single renderer and a single editor
serve all eight. The two sections that need more get it from extra fields rather
than a bespoke shape:

- dosage blocks carry `audience: 'adult' | 'pediatric'`, which drives the tabs;
- pregnancy adds `pregnancyCategory` (A/B/C/D/X/NA) and `lactation` text.

Editing works on a cloned draft and commits on Save, so Cancel discards cleanly.
Saving from the Pediatric tab keeps the Adult blocks untouched, and vice versa.

### Starter monographs

`src/data/monographs.json` holds 54 drafted monographs, keyed by generic name so
one entry covers every strength and form of that drug — currently 139 of the 390
catalog entries. Apply them from **Settings → Add starter monographs**.

**These are drafts, not a clinical authority.** Any drug they touch is stamped
with `monographSource` and shows an unverified banner until a pharmacist presses
*Mark as checked*, which records `monographReviewedAt`. Paediatric dosing is the
reason this flag exists.

Seeding never overwrites a section that already has content, so it is safe to
re-run after adding more seeds.

Interactions is free text for now; structured drug-pair checking is a later phase.

### សេចក្ដីសម្រេចសំខាន់ៗ / Key decisions

- **UUID ids and `createdAt`/`updatedAt` on every record from day one.** Nothing
  syncs today, but adding sync later must not require rewriting the schema.
- **`StockMove` is an append-only ledger.** `Batch.qtyOnHand` is a cached total;
  the ledger is the source of truth. Every quantity change writes its signed
  movement in the *same transaction* as the cache update, so a partial write
  cannot desynchronise them — and **Settings → Check stock totals** recomputes
  every total from the ledger if one ever does drift.
- **Soft delete everywhere** (`deletedAt`), so stock history never dangles.
- **Bilingual data, not translated data.** `nameKh` and `nameEn` are both stored
  on the record; only UI chrome goes through i18n.
- **Search is a multi-entry index.** `drugs.searchText` holds normalized tokens
  from the Khmer name, English name, generic name and code, so one query matches
  a term in any of them. Khmer text is NFC-normalized and stripped of zero-width
  characters first — without that, two visually identical strings fail to match.
- **Fonts are bundled, not fetched from a CDN**, because the app must render with
  no network.

## បញ្ជីឱសថយោង / Reference medicine list

The app ships with the **ACMC Essential Medicines list (June 2026)** from Japan
Heart Asia Children's Medical Center — 390 entries, carrying exactly the six
columns the source PDF has: drug class, drug name, dosage form, strength,
annotation, Japanese name. Import it from **Settings → Import medicine list**.

### How importing matches and merges

Matching is by `code`, falling back to the medicine's name when the file has no
code column. Medicines deleted in the app are not resurrected, and a row that
matches nothing and carries no name is skipped rather than creating a blank
record.

**Only the columns the file actually contains are written.** A blank cell, or a
missing column, leaves the stored value alone — which is what makes it safe to
bulk-edit one attribute:

```csv
Code,Sell price
PARACETAMOL-500MG,0.10
```

That updates the price and touches nothing else. The importer accepts
`Pack size`, `Cost price`, `Sell price` and `Reorder level` alongside the
reference columns, tolerating currency symbols and thousands separators
(`$0.18`, `1,200`). An explicit `0` is a real value — a reorder level of `0`
switches the low-stock alert off — whereas an empty cell means "don't change".

### Regenerating the catalog

`src/data/acmc-medicines.json` is generated, not hand-edited:

```bash
python3 -m venv .venv && .venv/bin/pip install pdfplumber
```

```bash
.venv/bin/python scripts/extract-acmc-pdf.py > rows.json && .venv/bin/python scripts/convert-acmc-catalog.py
```

The extractor deals with three things a plain table dump gets wrong, each
documented in the script: vertically merged cells (read by geometry, because
`extract_tables()` attaches a merged cell's text to one arbitrary row), category
headings that sit *between* tables, and the stock state — which is a **fill
colour**, not text. Grey means "currently no stock" and pale green "updated";
the orange first column is decoration, not a marker.

## ស្ថានភាព / Status

- [x] **Phase 1** — PWA shell, offline storage, i18n, medicine list + CRUD,
      full drug monograph (8 sections)
- [x] **Phase 2** — Batches, expiry dates, receiving stock, alerts
- [x] **Phase 3** — Patients, prescriptions, dispensing (FEFO)
- [x] **Phase 4** — Alerts dashboard (low stock / expiring) and reports
- [x] **Phase 5 (brought forward)** — Backup and restore
- [x] Spreadsheet export of reports

## ស្តុក / Stock

**Stock → medicine** shows its batches in FEFO order (first to expire, first
out) with the full movement history beneath.

- **Receive** takes packs or units and converts using the drug's `packSize`;
  expiry dates in the past are rejected at the form.
- **Adjust** records the *difference* against a counted quantity, not the new
  absolute — so the history reads "−6, breakage" — and requires a reason.
- **Write off** zeroes an expired batch and keeps the batch and its history.

The **Stock** landing page leads with what needs acting on: expired, expiring
within the warning window (default 90 days), and anything at or below its
reorder level. Only drugs with a reorder level set can raise a low-stock alert,
so a drug never stocked does not shout.

Dates are handled as local calendar dates, never `toISOString()` — at UTC+7 that
would report yesterday's date all evening and expire batches a day early.

## អ្នកជំងឺ និងការចេញឱសថ / Patients and dispensing

**Patients → patient → New visit** runs the whole encounter on one screen:
symptoms and diagnosis, then medicines with dose × times/day × days, and one
Dispense button that writes visit, prescription, dispense and stock movements in
a single transaction.

Three rules the code enforces rather than trusts the user with:

- **Expired stock is never allocated.** A batch past its date is invisible to
  the allocator regardless of quantity on it; it has to be written off.
- **Over-dispensing is impossible.** The shortfall is shown live while
  prescribing, and `recordDispense` recomputes the allocation inside the
  transaction — if stock moved since the screen rendered, the whole thing aborts
  rather than dispensing part of a prescription.
- **Allergies block the button.** `allergyMatches` compares recorded allergies
  against the drug's generic name, brands and classes with a deliberately loose
  substring match, so "Penicillin" catches "Amoxicillin". Dispensing stays
  disabled until someone ticks that they have checked it.

## របាយការណ៍ / Reports

**Reports** covers today, 7, 30 or 365 days: dispensing volume, revenue, cost,
profit and margin; a daily bar chart; the most-dispensed medicines; stock
movements; and the value of stock on hand at both cost and sell price, with the
portion sitting in expired or soon-to-expire batches called out separately.

Two decisions worth knowing:

- **Nothing is aggregated at write time.** Every figure is derived from the
  dispense records and the movement ledger on demand, so a corrected stock count
  or a restored backup changes the reports with no totals to rebuild.
- **Cost of goods comes from the batch each line was taken from**, not the
  drug's current cost price — the point of batch tracking is that what was
  dispensed in March cost what March's delivery cost.

The chart is hand-drawn SVG rather than a charting library, so the offline
bundle carries nothing extra. Export writes CSV with a UTF-8 BOM so Excel opens
the Khmer text correctly.

## ការបម្រុងទុក / Backup and restore

**Settings → Backup & restore.** Export writes the whole database to one JSON
file. On a phone it goes through the share sheet (Save to Files, email, AirDrop),
which is the route that works inside an installed PWA; desktop falls back to a
download. The card shows what is stored, when the last backup was taken, and
whether the browser has actually promised to keep the data.

Restore has two modes:

| Mode | What it does |
| --- | --- |
| **Merge** | Keeps both sides; for a record in both, the newer `updatedAt` wins. Use to combine two devices. |
| **Replace everything** | Clears every table, then restores the file exactly. Use after data loss. Confirmed behind a dialog. |

`searchText` is stripped on export and rebuilt on restore, so the file stays
smaller and a stale search index cannot survive a round trip.

A file that is not valid JSON, not from this app, or from a newer format version
is rejected before anything is written.

## ⚠️ ការបម្រុងទុកទិន្នន័យ / Data backup

ទិន្នន័យរក្សាទុកក្នុង IndexedDB នៃ browser តែប៉ុណ្ណោះ។ App ស្នើ
`navigator.storage.persist()` ដើម្បីការពារការលុបស្វ័យប្រវត្តិ ប៉ុន្តែ browser
ខ្លះ (ជាពិសេស Safari) អាចបដិសេធ។ **សូមនាំចេញឯកសារបម្រុងឲ្យបានទៀងទាត់** — App នឹងព្រមានពេលការបម្រុងទុកចុងក្រោយ
ចាស់ជាង ៧ ថ្ងៃ។

All data lives in the browser's IndexedDB. The app requests persistent storage,
but browsers may refuse. **Export a backup regularly** — the app warns when the
last one is more than 7 days old.
