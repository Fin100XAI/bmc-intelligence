import { useLocation } from 'react-router-dom'
import { Camera, ExternalLink, ShieldCheck } from 'lucide-react'
import { navItemForPath, sectionForPath } from '@/config/navigation'
import type { CorporationRef } from '@/config/corporations'
import { coverPhotos, photoCredit, type CoverPhoto, type CoverPhotoId } from '@/config/coverPhotos'
import { useActiveCorporation } from '@/stores/corporation.store'
import { useMastheadStore } from '@/stores/masthead.store'
import { formatNumber } from '@/utils/format'
import { t } from '@/i18n'

/**
 * The photographic banner at the head of every screen.
 *
 * One component, rendered by the shell above the page, so every screen opens
 * on a real photograph of Mumbai (Wikimedia Commons, credited on the banner
 * and in `public/cover/photos.json`) and on the corporation's own PUBLISHED
 * figures - never on modelled ones. Each figure is read from the corporation
 * record (`src/config/corporations.ts`) and links to the source that record
 * cites for it; a figure the record does not carry, or carries without a
 * source, is simply not shown.
 *
 * The page's own data below stays what it is - modelled demonstration data,
 * labelled as such on each screen. This band is the part of every page that
 * is the real city.
 */

type FactKey = 'population' | 'seats' | 'wards' | 'area' | 'established' | 'budget' | 'water' | 'sewage' | 'waste'

interface HeroFact {
  value: string
  label: string
  url: string
}

/** Whether a cited source is a government document, a news report or a secondary reference. */
function sourceKind(url: string): 'official' | 'news' | 'secondary' {
  const host = (() => {
    try {
      return new URL(url).hostname
    } catch {
      return ''
    }
  })()
  if (/\.gov\.in$|\.nic\.in$|^www\.cityfinance\.in$|mcgm\.gov\.in$/.test(host)) return 'official'
  if (/wikipedia\.org$|census2011\.co\.in$/.test(host)) return 'secondary'
  return 'news'
}

function sourceLabel(url: string): string {
  const kind = sourceKind(url)
  return kind === 'official' ? t('Official source') : kind === 'news' ? t('News report') : t('Secondary source')
}

/**
 * A published figure, with the source the corporation record cites for it.
 * Returns null where the record carries no value or no source, so the banner
 * never shows a number it cannot point to.
 */
function fact(corp: CorporationRef, key: FactKey): HeroFact | null {
  const source = (field: string): string | undefined => corp.sources.find((s) => s.field === field)?.url
  const make = (value: number | null | undefined, field: string, render: (v: number) => string, label: string): HeroFact | null => {
    const url = source(field)
    return value === null || value === undefined || !url ? null : { value: render(value), label, url }
  }
  switch (key) {
    case 'population':
      return make(corp.population2011, 'population2011', (v) => formatNumber(v), t('Residents (Census 2011)'))
    case 'seats':
      return make(corp.electoralWards, 'electoralWards', (v) => formatNumber(v), t('Corporator seats'))
    case 'wards':
      return make(corp.administrativeWards, 'administrativeWards', (v) => formatNumber(v), t('Administrative wards'))
    case 'area':
      return make(corp.areaSqKm, 'areaSqKm', (v) => t('{0} km²', formatNumber(v, 1)), t('Area'))
    case 'established':
      return make(corp.establishedYear, 'establishedYear', (v) => String(v), t('Municipal Corporation since'))
    case 'budget':
      return make(corp.budgetCrore, 'budgetCrore', (v) => t('₹{0} cr', formatNumber(v, 2)), t('Budget FY {0}', corp.budgetFinancialYear ?? ''))
    case 'water':
      return make(corp.waterSupplyMLD, 'waterSupplyMLD', (v) => t('{0} MLD', formatNumber(v)), t('Water supplied daily'))
    case 'sewage':
      return make(corp.sewageTreatmentMLD, 'sewageTreatmentMLD', (v) => t('{0} MLD', formatNumber(v)), t('Sewage treatment capacity'))
    case 'waste':
      return make(corp.solidWasteTPD, 'solidWasteTPD', (v) => t('{0} TPD', formatNumber(v)), t('Solid waste generated daily'))
  }
}

/**
 * Each section of the navigation and its three figures - chosen so each
 * section's figures are about the subject it covers.
 */
const SECTION_FACTS: Record<string, [FactKey, FactKey, FactKey]> = {
  command: ['population', 'area', 'budget'],
  finance: ['budget', 'population', 'established'],
  'property-tax': ['budget', 'population', 'wards'],
  'decisions-actions': ['population', 'wards', 'budget'],
  'wards-localities': ['wards', 'seats', 'population'],
  disaster: ['area', 'population', 'wards'],
  'water-sanitation': ['water', 'sewage', 'waste'],
  'roads-transport': ['area', 'population', 'wards'],
  'public-health': ['population', 'wards', 'area'],
  environment: ['area', 'population', 'waste'],
  'culture-amenities': ['population', 'area', 'established'],
  'citizen-social': ['population', 'wards', 'seats'],
  'social-development': ['population', 'wards', 'area'],
  planning: ['area', 'population', 'established'],
  delivery: ['budget', 'area', 'wards'],
  institution: ['seats', 'wards', 'established'],
  establishment: ['population', 'wards', 'established'],
  strategic: ['budget', 'population', 'seats'],
  ai: ['population', 'area', 'established'],
  trust: ['population', 'area', 'established'],
  'ai-governance-registers': ['population', 'area', 'established'],
  'platform-health': ['population', 'area', 'established'],
  'platform-admin': ['population', 'area', 'established'],
}
const DEFAULT_FACTS: [FactKey, FactKey, FactKey] = ['population', 'area', 'budget']

/**
 * A photograph chosen for one screen rather than its whole section, where a
 * picture of that very subject exists.
 */
const PAGE_PHOTO: Record<string, CoverPhotoId> = {
  '/command/executive': 'skylineNight',
  '/command/cockpit': 'bmcHeadOffice',
  '/command/situation-room': 'monsoonColaba',
  '/command/city-map': 'bkc',
  '/command/resolution-intelligence': 'csmt',
  '/city/water': 'viharLake',
  '/city/stormwater': 'mithiRiver',
  '/city/monsoon': 'powaiRain',
  '/city/roads': 'marineDrive',
  '/city/traffic': 'bestBus',
  '/city/coastal': 'chowpatty',
  '/city/environment': 'flamingos',
  '/city/gardens': 'hangingGardens',
  '/city/markets': 'crawfordMarket',
  '/city/heritage-tourism': 'csmt',
  '/city/disaster': 'monsoonColaba',
  '/governance/projects': 'coastalRoad',
  '/decision/public-money': 'coastalRoad',
  '/decision/systems-map': 'bkc',
  '/decision/roadmap': 'seaLink',
  '/governance/infrastructure-coordination': 'coastalRoad',
  '/governance/budget': 'bmcHeadOffice',
  '/council/resolutions': 'bmcHeadOffice',
}

/** Each section's photograph - chosen so neighbouring sections do not repeat one another. */
const SECTION_PHOTO: Record<string, CoverPhotoId> = {
  command: 'skylineNight',
  finance: 'marineDrive',
  'property-tax': 'bkc',
  'decisions-actions': 'bmcHeadOffice',
  'wards-localities': 'viharLake',
  disaster: 'monsoonColaba',
  'water-sanitation': 'powaiRain',
  'roads-transport': 'seaLink',
  'public-health': 'localTrain',
  environment: 'flamingos',
  'culture-amenities': 'csmt',
  'citizen-social': 'chowpatty',
  'social-development': 'crawfordMarket',
  planning: 'bkc',
  delivery: 'coastalRoad',
  institution: 'bmcHeadOffice',
  establishment: 'csmt',
  strategic: 'seaLink',
  ai: 'bkc',
  trust: 'csmt',
  'ai-governance-registers': 'hangingGardens',
  'platform-health': 'skylineNight',
  'platform-admin': 'hangingGardens',
}
const DEFAULT_PHOTO: CoverPhotoId = 'skylineNight'

export function PageHero(): React.JSX.Element | null {
  const location = useLocation()
  const corporation = useActiveCorporation()
  const declaredTitle = useMastheadStore((s) => s.title)
  const declaredStandfirst = useMastheadStore((s) => s.standfirst)

  const item = navItemForPath(location.pathname)
  const section = sectionForPath(location.pathname)
  const title = declaredTitle ?? item?.label
  if (!title) return null

  const standfirst = declaredStandfirst ?? item?.description
  const factKeys = (section && SECTION_FACTS[section.id]) || DEFAULT_FACTS
  const gallery = coverPhotos()
  const photoId = (item && PAGE_PHOTO[item.to]) ?? (section && SECTION_PHOTO[section.id]) ?? DEFAULT_PHOTO
  const photo: CoverPhoto = gallery[photoId] ?? gallery[DEFAULT_PHOTO]
  const facts = factKeys.map((key) => fact(corporation, key)).filter((f): f is HeroFact => f !== null)

  return (
    <section
      aria-label={title}
      className="relative isolate mx-auto mb-4 w-full max-w-[1600px] overflow-hidden rounded-2xl bg-[#0b1636] shadow-lg"
    >
      <img
        key={photo.src}
        src={photo.src}
        alt=""
        aria-hidden
        decoding="async"
        style={{ objectPosition: photo.focus }}
        className="hero-fade absolute inset-0 -z-10 h-full w-full object-cover"
      />
      <span aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-[#0b1636]/95 via-[#0f2257]/70 to-[#0b1636]/15" />

      <div className="flex flex-col gap-5 px-5 py-5 sm:px-6 lg:flex-row lg:items-end lg:justify-between lg:py-6">
        <div className="min-w-0 max-w-3xl">
          {section ? (
            <p className="text-[0.625rem] font-bold tracking-[0.16em] text-gold-300 uppercase">{section.label}</p>
          ) : null}
          <h2 className="mt-1.5 text-[clamp(1.375rem,2.4vw,2rem)] leading-tight font-extrabold tracking-[-0.02em] text-white drop-shadow-[0_2px_10px_rgb(0_0_0/0.4)]">
            {title}
          </h2>
          {standfirst ? <p className="mt-1.5 line-clamp-2 text-[0.8125rem] leading-relaxed text-white/80">{standfirst}</p> : null}
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-black/30 px-2.5 py-0.5 text-[0.625rem] text-white/75 ring-1 ring-white/15 backdrop-blur">
            <Camera className="h-3 w-3" aria-hidden />
            {t('Photo: {0}', photo.caption)}
            <span className="text-white/50">· {photoCredit(photo)}</span>
          </p>
        </div>

        {facts.length > 0 ? (
          <dl className="grid shrink-0 grid-cols-3 gap-1.5 sm:gap-2">
            {facts.map((f) => (
              <div
                key={f.label}
                className="w-full min-w-0 rounded-xl bg-white/10 px-2.5 py-2 ring-1 ring-white/20 backdrop-blur-md sm:w-[11.5rem] sm:px-3.5 sm:py-2.5"
              >
                <dd className="numeric text-[1rem] leading-none font-extrabold text-white sm:text-[1.25rem]">{f.value}</dd>
                <dt className="mt-1 line-clamp-3 text-[0.625rem] leading-snug font-medium text-white/80">{f.label}</dt>
                <dd>
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-1.5 inline-flex items-center gap-1 text-[0.625rem] font-semibold text-google-blue-200 hover:text-white hover:underline"
                  >
                    <ShieldCheck className="h-3 w-3" aria-hidden />
                    {sourceLabel(f.url)}
                    <ExternalLink className="hidden h-2.5 w-2.5 sm:inline" aria-hidden />
                  </a>
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </section>
  )
}

export default PageHero
