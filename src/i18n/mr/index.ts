import { registerMessages } from '../locale'
import { MR_PART_01 } from './part-01'
import { MR_PART_02 } from './part-02'
import { MR_PART_03 } from './part-03'
import { MR_PART_04 } from './part-04'
import { MR_PART_05 } from './part-05'
import { MR_PART_06 } from './part-06'
import { MR_PART_07 } from './part-07'
import { MR_PART_08 } from './part-08'
import { MR_PART_09 } from './part-09'
import { MR_PART_10 } from './part-10'
import { MR_PART_11 } from './part-11'
import { MR_PART_12 } from './part-12'
import { MR_PART_13 } from './part-13'
import { MR_PART_14 } from './part-14'
import { MR_PART_15 } from './part-15'
import { MR_PART_16 } from './part-16'
import { MR_PART_17 } from './part-17'
import { MR_PART_18 } from './part-18'
import { MR_PART_19 } from './part-19'
import { MR_PART_20 } from './part-20'
import { MR_PART_21 } from './part-21'
import { MR_PART_22 } from './part-22'
import { MR_PART_23 } from './part-23'
import { MR_PART_24 } from './part-24'
import { MR_PART_25 } from './part-25'
import { MR_PART_26 } from './part-26'
import { MR_PART_27 } from './part-27'
import { MR_PART_28 } from './part-28'
import { MR_PART_29 } from './part-29'
import { MR_PART_30 } from './part-30'
import { MR_PART_31 } from './part-31'

/**
 * The Marathi catalogue.
 *
 * Every entry is keyed by its exact English source, so a reviewer can read the
 * two languages side by side without resolving a key first, and a message with
 * no entry degrades to correct English rather than to a raw key on screen.
 *
 * Split into parts purely so the files stay reviewable - the catalogue is one
 * flat namespace, and registration order is the override order, later winning.
 * `scripts/i18n-audit.mjs` compares these keys against the strings the source
 * actually renders and fails on a gap in either direction, so the catalogue
 * cannot silently drift away from the interface it translates.
 */
registerMessages('mr', MR_PART_01)
registerMessages('mr', MR_PART_02)
registerMessages('mr', MR_PART_03)
registerMessages('mr', MR_PART_04)
registerMessages('mr', MR_PART_05)
registerMessages('mr', MR_PART_06)
registerMessages('mr', MR_PART_07)
registerMessages('mr', MR_PART_08)
registerMessages('mr', MR_PART_09)
registerMessages('mr', MR_PART_10)
registerMessages('mr', MR_PART_11)
registerMessages('mr', MR_PART_12)
registerMessages('mr', MR_PART_13)
registerMessages('mr', MR_PART_14)
registerMessages('mr', MR_PART_15)
registerMessages('mr', MR_PART_16)
registerMessages('mr', MR_PART_17)
registerMessages('mr', MR_PART_18)
registerMessages('mr', MR_PART_19)
registerMessages('mr', MR_PART_20)
registerMessages('mr', MR_PART_21)
registerMessages('mr', MR_PART_22)
registerMessages('mr', MR_PART_23)
registerMessages('mr', MR_PART_24)
registerMessages('mr', MR_PART_25)
registerMessages('mr', MR_PART_26)
registerMessages('mr', MR_PART_27)
registerMessages('mr', MR_PART_28)
registerMessages('mr', MR_PART_29)
registerMessages('mr', MR_PART_30)
registerMessages('mr', MR_PART_31)
