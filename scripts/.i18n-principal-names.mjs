/**
 * One-shot: set the fourteen demonstration principals' names in Devanagari.
 *
 * A sign-in screen that lists every position in Marathi and then the holder's
 * name in Latin reads as a half-finished translation, and these are the first
 * words an officer sees. Surnames follow the spellings already fixed in
 * part-16; initials take the Devanagari letter, as Marathi correspondence
 * writes them.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MR = join(ROOT, 'src', 'i18n', 'mr')

const NAMES = {
  'A. R. Deshpande': 'अ. र. देशपांडे',
  'S. V. Kulkarni': 'स. वि. कुलकर्णी',
  'P. M. Sawant': 'प. म. सावंत',
  'R. D. Gaikwad': 'र. द. गायकवाड',
  'N. B. Joshi': 'न. भ. जोशी',
  'K. S. Bhosale': 'क. स. भोसले',
  'V. T. Mhatre': 'वि. त. म्हात्रे',
  'Dr. M. A. Naik': 'डॉ. म. अ. नाईक',
  'G. L. Parab': 'ग. ल. परब',
  'T. S. Rane': 'त. स. राणे',
  'Dr. S. R. Iyer': 'डॉ. स. र. अय्यर',
  'D. K. Shinde': 'द. क. शिंदे',
  'A. P. Tambe': 'अ. प. तांबे',
  'J. B. Pawar': 'ज. भ. पवार',
  'S. H. Kadam': 'स. ह. कदम',
}

let total = 0
for (const file of readdirSync(MR).filter((f) => f.startsWith('part-'))) {
  const path = join(MR, file)
  let source = readFileSync(path, 'utf8')
  let changed = 0
  for (const [english, marathi] of Object.entries(NAMES)) {
    const selfMap = `'${english}': '${english}',`
    if (source.includes(selfMap)) {
      source = source.replace(selfMap, `'${english}': '${marathi}',`)
      changed += 1
    }
  }
  if (changed > 0) {
    writeFileSync(path, source)
    total += changed
    console.log(`${file}: ${changed} principal names set in Devanagari`)
  }
}
console.log(`${total} total`)
