import { format } from 'date-fns'
import { DEMO_NOW } from './deterministic'

/**
 * src/utils/export.ts
 *
 * Institutional export. Every register in this platform that an officer can
 * read, they can also take away — a screenshot is not a record, and a review
 * body asking "show me the register as it stood" needs a file, not a URL.
 *
 * Two rules hold across every export produced here:
 *
 *  - **The file states its own provenance.** Every export carries a header
 *    block naming the environment, the acting principal, the demonstration
 *    instant it was taken at and the filters in force. An exported figure that
 *    leaves this application without that context can be misread as a live
 *    municipal record, which is precisely the failure this platform exists to
 *    avoid.
 *  - **Nothing in a cell is executable.** Spreadsheet software treats a
 *    leading `=`, `+`, `-` or `@` as a formula. Municipal registers carry
 *    operator-entered names and reasons, so every cell is neutralised before
 *    it is written.
 *
 * Exports are consequential acts. Callers that hold an audit seam (the Trust
 * Centre pages, the audit trail itself) record the export through their
 * service before calling in here; this module only produces the file.
 */

export interface ExportColumn<T> {
  header: string
  value: (row: T) => string | number | null | undefined
}

export interface ExportMeta {
  /** Human title written into the file's provenance block. */
  title: string
  /** Acting principal, so an exported file is attributable. */
  actor?: string
  /** Environment label — never omitted, so a demonstration file says so. */
  environment?: string
  /** Any filters in force, rendered as "label: value" lines. */
  filters?: Record<string, string | undefined>
  /** Extra provenance sentences appended to the block. */
  notes?: string[]
}

/** Spreadsheet formula injection guard — see the module note above. */
function neutralise(input: string): string {
  const trimmed = input.replace(/[\r\n]+/g, ' ').trim()
  return /^[=+\-@\t]/.test(trimmed) ? `'${trimmed}` : trimmed
}

function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const text = neutralise(String(value))
  return /[",]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** The provenance block written above every exported table. */
function provenanceLines(meta: ExportMeta): string[] {
  const lines = [
    `# ${meta.title}`,
    `# Generated at,${csvCell(format(DEMO_NOW, "d MMM yyyy HH:mm 'IST'"))}`,
  ]
  if (meta.actor) lines.push(`# Exported by,${csvCell(meta.actor)}`)
  if (meta.environment) lines.push(`# Environment,${csvCell(meta.environment)}`)
  for (const [label, value] of Object.entries(meta.filters ?? {})) {
    if (value) lines.push(`# ${csvCell(label)},${csvCell(value)}`)
  }
  for (const note of meta.notes ?? []) lines.push(`# ${csvCell(note)}`)
  lines.push('')
  return lines
}

/** Renders rows to CSV text, provenance block first. */
export function toCsv<T>(rows: readonly T[], columns: Array<ExportColumn<T>>, meta: ExportMeta): string {
  const header = columns.map((c) => csvCell(c.header)).join(',')
  const body = rows.map((row) => columns.map((c) => csvCell(c.value(row))).join(','))
  return [...provenanceLines(meta), header, ...body].join('\n')
}

/**
 * A stable, sortable file name anchored to the demonstration clock rather
 * than the wall clock, so the same export taken twice is named identically.
 */
export function exportFilename(slug: string, extension: string): string {
  const stamp = format(DEMO_NOW, 'yyyyMMdd-HHmm')
  const safe = slug
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `bmc-${safe || 'export'}-${stamp}.${extension}`
}

/** Triggers a browser download. A no-op outside a DOM (server render, tests). */
function download(filename: string, contents: string, mime: string): void {
  if (typeof document === 'undefined' || typeof URL?.createObjectURL !== 'function') return
  const blob = new Blob([contents], { type: `${mime};charset=utf-8;` })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  // Revoke on the next frame so the navigation has begun before the URL dies.
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** Exports a table of rows as CSV and downloads it. Returns the file name. */
export function downloadCsv<T>(
  slug: string,
  rows: readonly T[],
  columns: Array<ExportColumn<T>>,
  meta: ExportMeta,
): string {
  const filename = exportFilename(slug, 'csv')
  download(filename, toCsv(rows, columns, meta), 'text/csv')
  return filename
}

/** Exports a structured record as JSON, with the same provenance envelope. */
export function downloadJson(slug: string, payload: unknown, meta: ExportMeta): string {
  const filename = exportFilename(slug, 'json')
  const envelope = {
    title: meta.title,
    generatedAt: DEMO_NOW.toISOString(),
    exportedBy: meta.actor,
    environment: meta.environment,
    filters: meta.filters,
    notes: meta.notes,
    payload,
  }
  download(filename, JSON.stringify(envelope, null, 2), 'application/json')
  return filename
}
