/**
 * src/config/bmc/wards.ts
 *
 * Mumbai's administrative wards as they stood at the 2011 Census - GENERATED
 * from _bmc_research/projects_wards.json by _bmc_tools/gen_public_money.py.
 *
 * Populations are the Census 2011 figures summed from the census sub-units
 * (ORGI, via OpenCity); they total 12,442,373, the Greater Mumbai figure.
 * Localities come from a published list of ward control rooms. Centroids are
 * representative points, not computed from ward boundaries, which are not
 * loaded. Since the census, P/North has been split into P/East and P/West
 * (2023) and K/East into K/North and K/South (2026); the 2011 structure is
 * kept here because that is the structure the populations describe.
 */

export interface BmcWard {
  code: string
  /** Localities the ward covers. */
  name: string
  zone?: number
  population2011?: number
  areaSqKm?: number
  centroid: { lat: number; lon: number }
  evidenceIds: string[]
  centroidNote?: string
}

export function bmcWards(): BmcWard[] {
  return [
    {
      code: 'A',
      name: 'Fort, Ballard Estate, Churchgate, Colaba',
      population2011: 185014,
      centroid: {
        lat: 18.925,
        lon: 72.83,
      },
      evidenceIds: [
        'ev-census2011-a',
        'ev-tvc-areas-a',
      ],
      centroidNote: 'Representative point chosen from geographic knowledge of the ward localities, not a computed polygon centroid.',
    },
    {
      code: 'B',
      name: 'I.R. Road, R.B. Marg, J.M.R. Marg (Dongri, Masjid Bunder area)',
      population2011: 127290,
      centroid: {
        lat: 18.958,
        lon: 72.836,
      },
      evidenceIds: [
        'ev-census2011-b',
        'ev-tvc-areas-b',
      ],
      centroidNote: 'Representative point chosen from geographic knowledge of the ward localities, not a computed polygon centroid.',
    },
    {
      code: 'C',
      name: 'Chandanwadi, Netaji Road, Marine Lines',
      population2011: 166161,
      centroid: {
        lat: 18.95,
        lon: 72.828,
      },
      evidenceIds: [
        'ev-census2011-c',
        'ev-tvc-areas-c',
      ],
      centroidNote: 'Representative point chosen from geographic knowledge of the ward localities, not a computed polygon centroid.',
    },
    {
      code: 'D',
      name: 'Grant Road, Walkeshwar, Opera House',
      population2011: 346866,
      centroid: {
        lat: 18.96,
        lon: 72.808,
      },
      evidenceIds: [
        'ev-census2011-d',
        'ev-tvc-areas-d',
      ],
      centroidNote: 'Representative point chosen from geographic knowledge of the ward localities, not a computed polygon centroid.',
    },
    {
      code: 'E',
      name: 'Byculla, Shuklaji Street, Wadi Bunder',
      population2011: 393286,
      centroid: {
        lat: 18.975,
        lon: 72.835,
      },
      evidenceIds: [
        'ev-census2011-e',
        'ev-tvc-areas-e',
      ],
      centroidNote: 'Representative point chosen from geographic knowledge of the ward localities, not a computed polygon centroid.',
    },
    {
      code: 'F/N',
      name: 'Matunga, Dadar (E)',
      population2011: 529034,
      centroid: {
        lat: 19.03,
        lon: 72.858,
      },
      evidenceIds: [
        'ev-census2011-fn',
        'ev-tvc-areas-fn',
      ],
      centroidNote: 'Representative point chosen from geographic knowledge of the ward localities, not a computed polygon centroid.',
    },
    {
      code: 'F/S',
      name: 'Parel, Sewri, Elphinston Road',
      population2011: 360972,
      centroid: {
        lat: 19.0,
        lon: 72.842,
      },
      evidenceIds: [
        'ev-census2011-fs',
        'ev-tvc-areas-fs',
      ],
      centroidNote: 'Representative point chosen from geographic knowledge of the ward localities, not a computed polygon centroid.',
    },
    {
      code: 'G/N',
      name: 'Dadar (W), Mahim',
      population2011: 599039,
      centroid: {
        lat: 19.033,
        lon: 72.845,
      },
      evidenceIds: [
        'ev-census2011-gn',
        'ev-tvc-areas-gn',
      ],
      centroidNote: 'Representative point chosen from geographic knowledge of the ward localities, not a computed polygon centroid.',
    },
    {
      code: 'G/S',
      name: 'N.M. Joshi Marg, Lower Parel, Worli',
      population2011: 377749,
      centroid: {
        lat: 19.005,
        lon: 72.818,
      },
      evidenceIds: [
        'ev-census2011-gs',
        'ev-tvc-areas-gs',
      ],
      centroidNote: 'Representative point chosen from geographic knowledge of the ward localities, not a computed polygon centroid.',
    },
    {
      code: 'H/E',
      name: 'Bandra (E), Khar (E), Santa Cruz (E)',
      population2011: 557239,
      centroid: {
        lat: 19.068,
        lon: 72.85,
      },
      evidenceIds: [
        'ev-census2011-he',
        'ev-tvc-areas-he',
      ],
      centroidNote: 'Representative point chosen from geographic knowledge of the ward localities, not a computed polygon centroid.',
    },
    {
      code: 'H/W',
      name: 'Bandra (W), Khar (W), Santa Cruz (W)',
      population2011: 307581,
      centroid: {
        lat: 19.065,
        lon: 72.83,
      },
      evidenceIds: [
        'ev-census2011-hw',
        'ev-tvc-areas-hw',
      ],
      centroidNote: 'Representative point chosen from geographic knowledge of the ward localities, not a computed polygon centroid.',
    },
    {
      code: 'K/E',
      name: 'Andheri (E), Vile Parle (E)',
      population2011: 823885,
      centroid: {
        lat: 19.115,
        lon: 72.87,
      },
      evidenceIds: [
        'ev-census2011-ke',
        'ev-tvc-areas-ke',
        'ev-fpj-knorth-op',
        'ev-fpj-26-wards',
      ],
      centroidNote: 'Representative point chosen from geographic knowledge of the ward localities, not a computed polygon centroid.',
    },
    {
      code: 'K/W',
      name: 'Andheri (W), Vile Parle (W), Juhu',
      population2011: 748688,
      centroid: {
        lat: 19.125,
        lon: 72.83,
      },
      evidenceIds: [
        'ev-census2011-kw',
        'ev-tvc-areas-kw',
      ],
      centroidNote: 'Representative point chosen from geographic knowledge of the ward localities, not a computed polygon centroid.',
    },
    {
      code: 'L',
      name: 'Kurla',
      population2011: 902225,
      centroid: {
        lat: 19.075,
        lon: 72.885,
      },
      evidenceIds: [
        'ev-census2011-l',
        'ev-tvc-areas-l',
      ],
      centroidNote: 'Representative point chosen from geographic knowledge of the ward localities, not a computed polygon centroid.',
    },
    {
      code: 'M/E',
      name: 'Govandi, Mankhurd',
      population2011: 807720,
      centroid: {
        lat: 19.05,
        lon: 72.93,
      },
      evidenceIds: [
        'ev-census2011-me',
        'ev-tvc-areas-me',
      ],
      centroidNote: 'Representative point chosen from geographic knowledge of the ward localities, not a computed polygon centroid.',
    },
    {
      code: 'M/W',
      name: 'Chembur',
      population2011: 411893,
      centroid: {
        lat: 19.055,
        lon: 72.9,
      },
      evidenceIds: [
        'ev-census2011-mw',
        'ev-tvc-areas-mw',
      ],
      centroidNote: 'Representative point chosen from geographic knowledge of the ward localities, not a computed polygon centroid.',
    },
    {
      code: 'N',
      name: 'Ghatkopar',
      population2011: 622853,
      centroid: {
        lat: 19.09,
        lon: 72.91,
      },
      evidenceIds: [
        'ev-census2011-n',
        'ev-tvc-areas-n',
      ],
      centroidNote: 'Representative point chosen from geographic knowledge of the ward localities, not a computed polygon centroid.',
    },
    {
      code: 'P/N',
      name: 'Malad, Marve, Manori',
      population2011: 941366,
      centroid: {
        lat: 19.19,
        lon: 72.83,
      },
      evidenceIds: [
        'ev-census2011-pn',
        'ev-tvc-areas-pn',
        'ev-fpj-pn-split',
        'ev-fpj-26-wards',
      ],
      centroidNote: 'Representative point chosen from geographic knowledge of the ward localities, not a computed polygon centroid.',
    },
    {
      code: 'P/S',
      name: 'Goregaon, Oshiwara',
      population2011: 463507,
      centroid: {
        lat: 19.165,
        lon: 72.845,
      },
      evidenceIds: [
        'ev-census2011-ps',
        'ev-tvc-areas-ps',
      ],
      centroidNote: 'Representative point chosen from geographic knowledge of the ward localities, not a computed polygon centroid.',
    },
    {
      code: 'R/N',
      name: 'Dahisar',
      population2011: 431368,
      centroid: {
        lat: 19.255,
        lon: 72.86,
      },
      evidenceIds: [
        'ev-census2011-rn',
        'ev-tvc-areas-rn',
      ],
      centroidNote: 'Representative point chosen from geographic knowledge of the ward localities, not a computed polygon centroid.',
    },
    {
      code: 'R/C',
      name: 'Borivali, Gorai',
      population2011: 562162,
      centroid: {
        lat: 19.23,
        lon: 72.845,
      },
      evidenceIds: [
        'ev-census2011-rc',
        'ev-tvc-areas-rc',
      ],
      centroidNote: 'Representative point chosen from geographic knowledge of the ward localities, not a computed polygon centroid.',
    },
    {
      code: 'R/S',
      name: 'Kandivali',
      population2011: 691229,
      centroid: {
        lat: 19.205,
        lon: 72.85,
      },
      evidenceIds: [
        'ev-census2011-rs',
        'ev-tvc-areas-rs',
      ],
      centroidNote: 'Representative point chosen from geographic knowledge of the ward localities, not a computed polygon centroid.',
    },
    {
      code: 'S',
      name: 'Bhandup',
      population2011: 743783,
      centroid: {
        lat: 19.14,
        lon: 72.935,
      },
      evidenceIds: [
        'ev-census2011-s',
        'ev-tvc-areas-s',
      ],
      centroidNote: 'Representative point chosen from geographic knowledge of the ward localities, not a computed polygon centroid.',
    },
    {
      code: 'T',
      name: 'Mulund',
      population2011: 341463,
      centroid: {
        lat: 19.172,
        lon: 72.955,
      },
      evidenceIds: [
        'ev-census2011-t',
        'ev-tvc-areas-t',
      ],
      centroidNote: 'Representative point chosen from geographic knowledge of the ward localities, not a computed polygon centroid.',
    },
  ]
}
