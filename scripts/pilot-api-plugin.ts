import type { IncomingMessage, ServerResponse } from 'node:http'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'

/**
 * scripts/pilot-api-plugin.ts
 *
 * A Vite dev-server-only backend for exactly one pilot data source: a
 * property/revenue CSV export, uploaded through the Data Sources admin UI.
 *
 * This exists to make one specific pitch claim literally true rather than
 * merely asserted: that the platform can ingest a real export from a system
 * BMC already runs (the Property Tax Citizen Portal) rather than only ever
 * reading its own deterministic demo data. It is deliberately narrow - one
 * connector, one file on disk, no database - because the point is to prove
 * the ingestion path exists, not to stand up production infrastructure.
 *
 * Storage is a single JSON file under `.pilot-data/` (git-ignored). It does
 * not survive a fresh clone or a `dist` build - `configureServer` only runs
 * under `vite dev`, never in the production bundle.
 */

const STORE_DIR = path.resolve(process.cwd(), '.pilot-data')
const STORE_FILE = path.join(STORE_DIR, 'revenue.json')
const MAX_BODY_BYTES = 5 * 1024 * 1024 // 5 MB is generous for a demo CSV and cheap to bound.

export interface PilotDataset {
  uploadedAt: string
  sourceFilename: string
  columns: string[]
  rows: Array<Record<string, string>>
}

/**
 * A small hand-rolled CSV parser rather than a dependency - the shape of
 * input here (a single uploaded file, in dev only) doesn't justify pulling
 * in a package, and this keeps the pilot's install footprint at zero.
 * Handles quoted fields (including embedded commas and escaped quotes) and
 * both \n and \r\n line endings.
 */
export function parseCsv(text: string): { columns: string[]; rows: Array<Record<string, string>> } {
  const table: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
      continue
    }
    if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.length > 1 || row[0] !== '') table.push(row)
      row = []
    } else {
      field += c
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    table.push(row)
  }

  const [header, ...dataRows] = table
  if (!header || header.length === 0) return { columns: [], rows: [] }

  const columns = header.map((h) => h.trim()).filter(Boolean)
  const rows = dataRows
    .filter((r) => r.some((cell) => cell.trim() !== ''))
    .map((r) => {
      const obj: Record<string, string> = {}
      columns.forEach((col, idx) => {
        obj[col] = (r[idx] ?? '').trim()
      })
      return obj
    })

  return { columns, rows }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    let bytes = 0
    req.on('data', (chunk: Buffer) => {
      bytes += chunk.length
      if (bytes > MAX_BODY_BYTES) {
        reject(new Error('Upload exceeds the 5 MB demo limit.'))
        req.destroy()
        return
      }
      data += chunk.toString('utf-8')
    })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

export function pilotApiPlugin(): Plugin {
  return {
    name: 'pilot-api',
    configureServer(server) {
      server.middlewares.use('/api/pilot/revenue', async (req, res) => {
        try {
          if (req.method === 'GET') {
            try {
              const raw = await fs.readFile(STORE_FILE, 'utf-8')
              res.statusCode = 200
              res.setHeader('Content-Type', 'application/json')
              res.end(raw)
            } catch {
              sendJson(res, 200, null)
            }
            return
          }

          if (req.method === 'POST') {
            const body = await readBody(req)
            let parsed: { filename?: string; content?: string }
            try {
              parsed = JSON.parse(body) as { filename?: string; content?: string }
            } catch {
              sendJson(res, 400, { error: 'Request body must be JSON: { filename, content }.' })
              return
            }
            const { filename, content } = parsed
            if (typeof content !== 'string' || !content.trim()) {
              sendJson(res, 400, { error: 'No CSV content received.' })
              return
            }
            const { columns, rows } = parseCsv(content)
            if (columns.length === 0 || rows.length === 0) {
              sendJson(res, 400, {
                error: 'Could not read any rows from this file. Expected a header row followed by at least one data row.',
              })
              return
            }
            const dataset: PilotDataset = {
              uploadedAt: new Date().toISOString(),
              sourceFilename: filename && filename.trim() ? filename : 'upload.csv',
              columns,
              rows,
            }
            await fs.mkdir(STORE_DIR, { recursive: true })
            await fs.writeFile(STORE_FILE, JSON.stringify(dataset), 'utf-8')
            sendJson(res, 200, dataset)
            return
          }

          if (req.method === 'DELETE') {
            await fs.rm(STORE_FILE, { force: true })
            sendJson(res, 200, { ok: true })
            return
          }

          sendJson(res, 405, { error: 'Method not allowed.' })
        } catch (err) {
          sendJson(res, 500, { error: err instanceof Error ? err.message : 'Unknown server error.' })
        }
      })
    },
  }
}
