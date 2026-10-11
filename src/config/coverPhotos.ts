import { t } from '@/i18n'

/**
 * src/config/coverPhotos.ts
 *
 * Real photographs of Mumbai, all from Wikimedia Commons under free licences
 * (CC BY / CC BY-SA / FAL / CC0). Authors, licences and source links are listed
 * in public/cover/PHOTO-CREDITS.txt (machine-readable: public/cover/photos.json).
 *
 * One catalogue for every surface that shows them - the portal, the sign-in
 * panel and the console's page banners - so a caption or credit is corrected
 * once. Each is captioned with what it actually shows; none is presented as a
 * claim about whose page this is.
 *
 * The crop each one needs is carried with it: a letterbox crop of a photograph
 * taken from the ground centres on sky and roadway if left alone, and
 * `object-position` is what puts the subject in the frame instead.
 */

export interface CoverPhoto {
  src: string
  /** Passed straight to `object-position`. */
  focus: string
  /** What the photograph shows - its caption, never a claim about it. */
  caption: string
  /** Wikimedia Commons author, as the photograph is credited there. */
  author: string
  licence: string
}

export type CoverPhotoId =
  | 'skylineNight'
  | 'marineDrive'
  | 'flamingos'
  | 'powaiRain'
  | 'seaLink'
  | 'csmt'
  | 'bestBus'
  | 'monsoonColaba'
  | 'crawfordMarket'
  | 'viharLake'
  | 'mithiRiver'
  | 'bmcHeadOffice'
  | 'chowpatty'
  | 'localTrain'
  | 'coastalRoad'
  | 'hangingGardens'
  | 'bkc'

/** Built rather than declared so the captions follow a language switch. */
export function coverPhotos(): Record<CoverPhotoId, CoverPhoto> {
  return {
    skylineNight: { src: '/cover/mumbai-skyline-marine-drive.jpg', focus: '50% 55%', caption: t('The Mumbai skyline over Marine Drive at night'), author: 'Av9', licence: 'CC BY-SA 4.0' },
    marineDrive: { src: '/cover/marine-drive.jpg', focus: '50% 60%', caption: t('Marine Drive and the Back Bay skyline'), author: 'A.Savin', licence: 'FAL' },
    flamingos: { src: '/cover/sewri-flamingos.jpg', focus: '50% 50%', caption: t('Flamingos on the Sewri mudflats'), author: 'Harvinder Chandigarh', licence: 'CC BY-SA 4.0' },
    powaiRain: { src: '/cover/powai-lake-after-rain.jpg', focus: '50% 50%', caption: t('Powai Lake after heavy rain'), author: 'Shishirdasika', licence: 'CC BY-SA 4.0' },
    seaLink: { src: '/cover/bandra-worli-sea-link.jpg', focus: '50% 55%', caption: t('The Bandra-Worli Sea Link at sunset'), author: 'Capturedmumbai', licence: 'CC BY-SA 4.0' },
    csmt: { src: '/cover/csmt.jpg', focus: '50% 45%', caption: t('Chhatrapati Shivaji Maharaj Terminus'), author: 'Joe Ravi', licence: 'CC BY-SA 3.0' },
    bestBus: { src: '/cover/best-double-decker.jpg', focus: '55% 50%', caption: t('A BEST double-decker bus near CSMT'), author: 'Shishirdasika', licence: 'CC BY-SA 4.0' },
    monsoonColaba: { src: '/cover/monsoon-colaba.jpg', focus: '50% 50%', caption: t('Monsoon rain at Apollo Bunder, Colaba'), author: 'Rajarshi MITRA', licence: 'CC BY 2.0' },
    crawfordMarket: { src: '/cover/crawford-market.jpg', focus: '50% 45%', caption: t('Mahatma Jyotiba Phule Mandai (Crawford Market)'), author: 'Saarang Rajguru', licence: 'CC BY-SA 4.0' },
    viharLake: { src: '/cover/vihar-lake.jpg', focus: '50% 55%', caption: t('Vihar Lake and the Mulund skyline from Yogi Hills'), author: 'Planemad', licence: 'CC BY-SA 4.0' },
    mithiRiver: { src: '/cover/mithi-river.jpg', focus: '50% 55%', caption: t('The Mithi River at CST Road, Kalina'), author: 'Trinidade', licence: 'CC BY-SA 4.0' },
    bmcHeadOffice: { src: '/cover/bmc-head-office.jpg', focus: '50% 35%', caption: t('The Brihanmumbai Municipal Corporation head office, Fort'), author: 'Pradeep717', licence: 'CC BY-SA 4.0' },
    chowpatty: { src: '/cover/girgaon-chowpatty.jpg', focus: '50% 55%', caption: t('Girgaon Chowpatty beach'), author: 'Vyacheslav Argenberg', licence: 'CC BY 4.0' },
    localTrain: { src: '/cover/local-train.jpg', focus: '50% 50%', caption: t('A Mumbai suburban local train'), author: 'Pratishkhedekar', licence: 'CC BY-SA 4.0' },
    coastalRoad: { src: '/cover/coastal-road-night.jpg', focus: '50% 60%', caption: t('The Mumbai Coastal Road by night'), author: 'Qiw007', licence: 'CC BY 4.0' },
    hangingGardens: { src: '/cover/hanging-gardens.jpg', focus: '50% 50%', caption: t('The Hanging Gardens, Malabar Hill'), author: 'A.Savin', licence: 'FAL' },
    bkc: { src: '/cover/bandra-kurla-complex.jpg', focus: '50% 55%', caption: t('Bandra-Kurla Complex'), author: 'N. Vivekananthamoorthy', licence: 'CC BY 4.0' },
  }
}

/** The short credit its licence asks for: "author · licence". */
export function photoCredit(photo: CoverPhoto): string {
  return `${photo.author} · ${photo.licence}`
}
