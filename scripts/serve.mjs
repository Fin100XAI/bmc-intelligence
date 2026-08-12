/**
 * Production static server.
 *
 * `vite preview` serves the built application correctly but says of itself that
 * it is not intended to be a production server. This is: a dependency-free Node
 * server that can be pointed at `dist/` on any host that runs Node - a VPS
 * behind nginx, a container, Render, Railway, Fly - and behave the way a
 * municipal deployment needs it to.
 *
 * The one thing it exists for above all others is the SINGLE-PAGE FALLBACK.
 * The application routes in the browser (`createBrowserRouter` in
 * `src/routes/index.tsx`), so `/command/my-tasks` is a client-side path, not a
 * file. A plain static host answers it with 404 - which means an officer who
 * refreshes the page they are working on, or opens a link a colleague sent
 * them, is thrown out of the platform onto an error page. Every request that
 * is not a real file is therefore answered with `index.html`, and the router
 * resolves the path once the application has booted.
 *
 * Requests for a missing ASSET still 404 honestly. Serving `index.html` in
 * place of a missing script would turn a deployment mistake into a blank
 * screen with no explanation, which is the failure mode this platform is
 * written to avoid everywhere else.
 *
 * Run with:  npm run serve          (after npm run build)
 *            npm start              (builds, then serves)
 *
 * Environment:
 *   PORT  - port to bind (default 4173). Hosts that inject a port set this.
 *   HOST  - interface to bind (default 0.0.0.0, required by most hosts).
 *   DIST  - directory to serve (default ./dist).
 */
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { createGzip } from 'node:zlib'
import { pipeline } from 'node:stream/promises'

const PORT = Number(process.env.PORT ?? 4173)
const HOST = process.env.HOST ?? '0.0.0.0'
const ROOT = resolve(process.env.DIST ?? fileURLToPath(new URL('../dist', import.meta.url)))
const INDEX = join(ROOT, 'index.html')

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
}

/** Types worth compressing. Images and fonts are already compressed; running
 *  them through gzip costs CPU and returns nothing. */
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.webmanifest', '.map', '.txt'])

/**
 * Everything under `/assets/` is content-hashed by the build, so its URL
 * changes whenever its bytes do and it can be cached indefinitely. Every other
 * response - `index.html` above all - must be revalidated, or a browser will
 * keep serving the previous deployment's entry point and load asset URLs that
 * no longer exist.
 */
function cacheControlFor(pathname) {
  return pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache'
}

/**
 * Resolves a URL path to a file inside the served directory, or null.
 *
 * Rejects anything that escapes the root. A static server that can be walked
 * out of with `../` hands over whatever the process can read, and this one is
 * meant to be exposed to the public internet.
 */
function resolveFile(pathname) {
  const decoded = decodeURIComponent(pathname)
  if (decoded.includes('\0')) return null
  const candidate = resolve(join(ROOT, normalize(decoded)))
  if (candidate !== ROOT && !candidate.startsWith(ROOT + sep)) return null
  return candidate
}

async function statFile(path) {
  try {
    const info = await stat(path)
    return info.isFile() ? info : null
  } catch {
    return null
  }
}

async function send(req, res, path, status, pathname) {
  const ext = extname(path).toLowerCase()
  const headers = {
    'content-type': CONTENT_TYPES[ext] ?? 'application/octet-stream',
    'cache-control': cacheControlFor(pathname),
    // The application loads nothing from a third party and holds no
    // credentials, but a deployment on a municipal domain should still not be
    // frameable or content-sniffable.
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'same-origin',
  }

  if (req.method === 'HEAD') {
    res.writeHead(status, headers).end()
    return
  }

  const acceptsGzip = /\bgzip\b/.test(req.headers['accept-encoding'] ?? '')
  if (acceptsGzip && COMPRESSIBLE.has(ext)) {
    headers['content-encoding'] = 'gzip'
    headers.vary = 'Accept-Encoding'
    res.writeHead(status, headers)
    await pipeline(createReadStream(path), createGzip(), res)
    return
  }

  res.writeHead(status, headers)
  await pipeline(createReadStream(path), res)
}

const server = createServer(async (req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD', 'content-type': 'text/plain; charset=utf-8' })
      res.end('Method not allowed')
      return
    }

    const pathname = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`).pathname
    const file = resolveFile(pathname)
    if (!file) {
      res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' }).end('Bad request')
      return
    }

    const info = await statFile(file)
    if (info) {
      await send(req, res, file, 200, pathname)
      return
    }

    // A missing file with an extension is a missing asset - report it as one.
    // Anything else is a client-side route: hand back the entry point and let
    // the router resolve it.
    if (extname(pathname)) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('Not found')
      return
    }

    await send(req, res, INDEX, 200, '/index.html')
  } catch (error) {
    if (res.headersSent) {
      res.destroy()
      return
    }
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('Internal server error')
    console.error('[serve] request failed', req.url, error)
  }
})

if (!(await statFile(INDEX))) {
  console.error(`[serve] no build found at ${ROOT}. Run "npm run build" first.`)
  process.exit(1)
}

server.listen(PORT, HOST, () => {
  console.log(`[serve] BMC Intelligence Infrastructure`)
  console.log(`[serve] serving ${ROOT}`)
  console.log(`[serve] listening on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`)
  console.log(`[serve] client-side routes fall back to index.html`)
})

// Hosts stop a process by signalling it. Closing the server first lets
// in-flight responses finish instead of being cut off mid-transfer.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`\n[serve] ${signal} received, shutting down`)
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 5000).unref()
  })
}
