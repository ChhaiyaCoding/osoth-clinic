/**
 * A minimal but correct RFC 4180 CSV reader.
 *
 * Hand-written rather than pulled from a package because the file has to parse
 * offline in a 25-line function, and the cases that actually break naive
 * `split(',')` all show up in real medicine lists: quoted fields containing
 * commas ("Amoxicillin, oral"), embedded newlines in an annotation, and
 * doubled quotes.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let index = 0

  // A UTF-8 BOM would otherwise become part of the first header name.
  if (text.charCodeAt(0) === 0xfeff) index = 1

  const endField = () => {
    row.push(field)
    field = ''
  }
  const endRow = () => {
    endField()
    // Ignore the trailing blank line every spreadsheet export adds.
    if (row.length > 1 || row[0] !== '') rows.push(row)
    row = []
  }

  while (index < text.length) {
    const char = text[index]

    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"'
          index += 2
          continue
        }
        quoted = false
        index += 1
        continue
      }
      field += char
      index += 1
      continue
    }

    if (char === '"' && field === '') {
      quoted = true
      index += 1
      continue
    }
    if (char === ',') {
      endField()
      index += 1
      continue
    }
    if (char === '\r') {
      index += 1
      continue
    }
    if (char === '\n') {
      endRow()
      index += 1
      continue
    }
    field += char
    index += 1
  }

  if (field !== '' || row.length > 0) endRow()
  return rows
}

/** Quote a value for CSV output only when it needs it. */
function escapeCsv(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

export function toCsv(rows: (string | number | boolean | null | undefined)[][]): string {
  return rows.map((row) => row.map((cell) => escapeCsv(String(cell ?? ''))).join(',')).join('\n')
}
