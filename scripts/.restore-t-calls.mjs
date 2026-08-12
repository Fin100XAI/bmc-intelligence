/** One-shot: the scoped rename also hit the injected translator calls. Undo those. */
import { readFileSync, writeFileSync } from 'node:fs'

const targets = {
  'src/pages/city/MonsoonIntelligencePage.tsx': 'tide',
  'src/pages/governance/RevenueReconciliationPage.tsx': 'tier',
  'src/pages/trust/ResilienceDRPage.tsx': 'test',
}

for (const [path, name] of Object.entries(targets)) {
  const src = readFileSync(path, 'utf8')
  // Only a call whose first argument is a string literal is a translator call.
  const pattern = new RegExp(`\\b${name}\\((?=')`, 'g')
  const matches = src.match(pattern)?.length ?? 0
  writeFileSync(path, src.replace(pattern, 't('))
  console.log(`${path}: ${matches} translator calls repaired`)
}
