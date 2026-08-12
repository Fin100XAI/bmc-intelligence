/**
 * Language smoke test.
 *
 * Asserts the one property the whole bilingual design rests on: SWITCHING
 * LANGUAGE RE-DESCRIBES THE CITY, IT DOES NOT MOVE IT.
 *
 * The seeded data layers are rebuilt on a language switch, exactly as they are
 * on a corporation switch, because alert titles, defect summaries and register
 * rows are composed inside those layers. That rebuild draws from seeds keyed on
 * the corporation and never on the language — so every figure on screen before
 * the switch must be the same figure after it. A language toggle that quietly
 * moved a number would be far worse than one that failed loudly, and a type
 * check cannot see the difference.
 *
 * It also checks the seam itself: that `t()` is the identity in English, that
 * Marathi actually reaches the screen, that placeholders survive interpolation,
 * and that switching back to English restores the original picture byte for
 * byte.
 *
 * Run with: node scripts/smoke-i18n.mjs
 */
import { createServer } from 'vite'

const results = []
let failures = 0

async function check(name, fn) {
  try {
    const detail = await fn()
    results.push(['PASS', name, detail ?? ''])
  } catch (error) {
    failures += 1
    results.push(['FAIL', name, error?.message ?? String(error)])
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

/** Every number in an object graph, in traversal order. */
function numbersIn(value, out = [], depth = 0) {
  if (depth > 8 || out.length > 20000) return out
  if (typeof value === 'number') {
    if (Number.isFinite(value)) out.push(value)
    return out
  }
  if (Array.isArray(value)) {
    for (const item of value) numbersIn(item, out, depth + 1)
    return out
  }
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value).sort()) numbersIn(value[key], out, depth + 1)
  }
  return out
}

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
})

try {
  const load = (p) => server.ssrLoadModule(p)

  const i18n = await load('/src/i18n/index.ts')
  const runtime = await load('/src/data/runtime.ts')
  const reference = await load('/src/data/reference.ts')
  const intelligence = await load('/src/data/intelligence.data.ts')
  const operations = await load('/src/data/operations.data.ts')
  const finance = await load('/src/data/finance.data.ts')
  const config = await load('/src/config/municipality.config.ts')
  const format = await load('/src/utils/format.ts')

  /** Rebuilds every layer for the given language, as the store does. */
  const setLocale = (locale) => {
    i18n.setActiveLocale(locale)
    runtime.rebuildAllLayers()
  }

  /* The measurable picture: every figure the municipal layers publish. */
  const snapshot = () => ({
    wards: numbersIn(reference.WARDS),
    departments: numbersIn(reference.DEPARTMENTS),
    intelligence: numbersIn(intelligence.INTELLIGENCE_ITEMS),
    alerts: numbersIn(intelligence.ALERTS),
    decisions: numbersIn(operations.DECISION_CASES),
    finance: numbersIn(finance.BUDGET_LINES ?? []),
    wardIds: reference.WARDS.map((w) => w.id),
    departmentIds: reference.DEPARTMENTS.map((d) => d.id),
    alertIds: intelligence.ALERTS.map((a) => a.id),
  })

  const sameShape = (a, b, label) => {
    const left = JSON.stringify(a)
    const right = JSON.stringify(b)
    if (left !== right) {
      // Point at the first divergence rather than dumping both graphs.
      let i = 0
      while (i < left.length && left[i] === right[i]) i += 1
      throw new Error(`${label} diverged at offset ${i}: …${left.slice(Math.max(0, i - 60), i + 60)}… vs …${right.slice(Math.max(0, i - 60), i + 60)}…`)
    }
  }

  setLocale('en')
  const english = snapshot()
  const englishWardName = reference.WARDS[0]?.name ?? ''
  const englishDeptName = reference.DEPARTMENTS[0]?.name ?? ''

  await check('t() is the identity function in English', () => {
    assert(i18n.getLocale() === 'en', 'expected English')
    const probe = 'Ward Performance'
    assert(i18n.t(probe) === probe, 'English t() must return its argument unchanged')
    assert(i18n.t('{0} of {1} wards', 3, 24) === '3 of 24 wards', 'English interpolation broken')
  })

  setLocale('mr')
  const marathi = snapshot()

  await check('the catalogue is installed and reaches the screen', () => {
    assert(i18n.getLocale() === 'mr', 'expected Marathi')
    assert(i18n.catalogueSize('mr') > 1000, `catalogue looks empty: ${i18n.catalogueSize('mr')} entries`)
    const rendered = i18n.t('Ward Performance')
    assert(/[ऀ-ॿ]/.test(rendered), `expected Devanagari, got ${JSON.stringify(rendered)}`)
  })

  await check('placeholders survive translation', () => {
    const rendered = i18n.t('{0} of {1} wards', 3, 24)
    assert(rendered.includes('3') && rendered.includes('24'), `values lost: ${JSON.stringify(rendered)}`)
    assert(!/\{\d\}/.test(rendered), `unsubstituted placeholder: ${JSON.stringify(rendered)}`)
  })

  await check('the deployment renames itself', () => {
    assert(
      /[ऀ-ॿ]/.test(config.municipality.municipalityName),
      `corporation name not in Marathi: ${config.municipality.municipalityName}`,
    )
  })

  await check('the register renames itself', () => {
    const wardName = reference.WARDS[0]?.name ?? ''
    const deptName = reference.DEPARTMENTS[0]?.name ?? ''
    assert(wardName !== '' && deptName !== '', 'register is empty')
    assert(
      wardName !== englishWardName || deptName !== englishDeptName,
      'neither the ward nor the department register changed language',
    )
  })

  await check('officers are named in the script the screen is set in', () => {
    const officer = reference.OFFICERS[0]
    assert(officer !== undefined, 'no officers in the register')
    assert(/[ऀ-ॿ]/.test(officer.name), `officer name not in Devanagari: ${officer.name}`)
    assert(officer.name.split(' ').length === 2, `name lost its shape: ${officer.name}`)
  })

  await check('dates are formatted with Marathi month names', () => {
    const rendered = format.formatDate('2026-07-24T09:20:00.000Z')
    assert(/[ऀ-ॿ]/.test(rendered), `date not localised: ${JSON.stringify(rendered)}`)
    assert(/24/.test(rendered), `day-of-month lost: ${JSON.stringify(rendered)}`)
    assert(/2026/.test(rendered), `year lost: ${JSON.stringify(rendered)}`)
  })

  await check('ages are formatted in Marathi', () => {
    const rendered = format.formatRelative('2026-07-24T06:20:00.000Z')
    assert(/[ऀ-ॿ]/.test(rendered), `relative age not localised: ${JSON.stringify(rendered)}`)
  })

  await check('NO FIGURE MOVES between English and Marathi', () => {
    sameShape(english.wards, marathi.wards, 'ward figures')
    sameShape(english.departments, marathi.departments, 'department figures')
    sameShape(english.intelligence, marathi.intelligence, 'intelligence figures')
    sameShape(english.alerts, marathi.alerts, 'alert figures')
    sameShape(english.decisions, marathi.decisions, 'decision figures')
    sameShape(english.finance, marathi.finance, 'finance figures')
    return `${english.wards.length + english.intelligence.length + english.alerts.length} figures compared`
  })

  await check('no identifier moves between English and Marathi', () => {
    sameShape(english.wardIds, marathi.wardIds, 'ward ids')
    sameShape(english.departmentIds, marathi.departmentIds, 'department ids')
    sameShape(english.alertIds, marathi.alertIds, 'alert ids')
    return `${english.wardIds.length + english.departmentIds.length + english.alertIds.length} identifiers compared`
  })

  setLocale('en')
  const englishAgain = snapshot()

  await check('switching back reproduces the English picture exactly', () => {
    sameShape(english, englishAgain, 'full snapshot')
    assert(reference.WARDS[0]?.name === englishWardName, 'ward name did not return to English')
  })

  await check('every corporation survives a language switch', async () => {
    // The roster this build carries, whatever its length. It is Brihanmumbai
    // alone today; the loop is over the roster rather than over a hand-written
    // sample so it stays correct if that ever changes.
    const corporations = await load('/src/config/corporations.ts')
    const sample = corporations.CORPORATIONS.map((c) => c.id)
    assert(sample.length >= 1, 'expected at least one corporation to sample')
    for (const id of sample) {
      runtime.setActiveCorporation(id)
      setLocale('en')
      const before = snapshot()
      setLocale('mr')
      const after = snapshot()
      sameShape(before.wards, after.wards, `${id} ward figures`)
      sameShape(before.intelligence, after.intelligence, `${id} intelligence figures`)
      assert(reference.WARDS.length > 0, `${id} has no wards after a language switch`)
      setLocale('en')
    }
    runtime.setActiveCorporation('bmc')
    return `${sample.length} corporations checked`
  })
} finally {
  await server.close()
}

const width = Math.max(...results.map((r) => r[1].length))
for (const [status, name, detail] of results) {
  console.log(`${status}  ${name.padEnd(width)}  ${detail}`)
}
console.log(`\n${results.length - failures}/${results.length} checks passed`)
process.exitCode = failures > 0 ? 1 : 0
