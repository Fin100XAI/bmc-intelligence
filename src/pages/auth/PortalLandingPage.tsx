import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Building2,
  Camera,
  ChevronRight,
  CloudRain,
  Droplets,
  FileText,
  Gauge,
  IndianRupee,
  Info,
  Landmark,
  LogIn,
  AtSign,
  MapPin,
  Megaphone,
  MessageCircle,
  Pause,
  Play,
  Radar,
  Route,
  Rss,
  Scale,
  Share2,
  Phone,
  Search,
  Siren,
  Smartphone,
  Trash2,
  Waves,
  type LucideIcon,
} from 'lucide-react'
import { corporationName } from '@/config/corporations'
import { coverPhotos, type CoverPhoto } from '@/config/coverPhotos'
import { municipality } from '@/config/municipality.config'
import { NAV_SECTIONS, ROUTES } from '@/config/navigation'
import { useActiveCorporation } from '@/stores/corporation.store'
import { useCurrentUser } from '@/stores/auth.store'
import { useApplyLocale } from '@/stores/locale.store'
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher'
import { EnvironmentBadge } from '@/components/ui/badges'
import { cn } from '@/utils/cn'
import { DEMO_NOW, det, isoDaysFromAnchor } from '@/utils/deterministic'
import { formatDate, formatNumber } from '@/utils/format'
import { t } from '@/i18n'
import { registerLayer } from '@/data/runtime'

/**
 * THE FRONT DOOR
 *
 * The platform's own front page, wearing the CHROME of a municipal
 * corporation's portal - the utility strip with its accessibility and language
 * controls, the masthead, the notice board, the link tiles, the three-column
 * footer with its compliance marks - because that is the shape a Maharashtra
 * government officer already knows how to read.
 *
 * IT IS READ BY OFFICERS, NOT BY CITIZENS. That is the one thing to hold on to
 * when editing anything here, because every instinct the chrome invites is the
 * wrong one. A citizen portal puts "pay property tax" on a tile, because paying
 * it is the errand. An officer never pays it: they are asked at ten in the
 * morning why collection is behind in three wards, so the tile is the screen
 * that answers that.
 *
 * The bands, in order:
 *
 *   hero            what this is, over real photographs of Mumbai
 *   coverage        every service the city runs           [photographic]
 *   surfaces        what an officer works from behind sign-in
 *   assurance       why any of it should be believed
 *   notices         circulars, escalations and what has changed
 *   links           the screens an officer opens daily
 *   pictures        every photograph on the page, with its credit
 *   footer          the office, the service desk, the marks
 *
 * It is DEPLOYMENT-NEUTRAL in its figures: every name, number and address is
 * read from the ACTIVE corporation record. The photographs are of Mumbai, from
 * Wikimedia Commons, each captioned for what it shows and credited in the
 * "Mumbai in pictures" band - a civic image is never a claim about whose page
 * this is.
 *
 * It is NOT a claim to be the corporation's live portal, and must never be
 * allowed to read as one. The environment badge sits in the utility strip and
 * the footer states what this is.
 */

/* ==========================================================================
   The service catalogue
   ========================================================================== */

interface PortalLink {
  label: string
  /** Present only where this platform actually implements the surface. */
  to?: string
  /** Shown on hover for entries that are not platform surfaces. */
  note?: string
}

/**
 * Where a portal tile or menu link actually goes.
 *
 * On this deployment sign-in comes BEFORE the portal, so every destination
 * leads straight into the platform. Nothing is granted by a link:
 * `RequireAuth` and `RequirePermission` re-evaluate on arrival, so a visitor
 * without a session, or a role without the permission, is refused there.
 */
function signInFor(to: string, isAuthenticated: boolean): string {
  void isAuthenticated
  return to
}

interface PortalMenu {
  id: string
  label: string
  groups: Array<{ heading?: string; links: PortalLink[] }>
}

function build$PORTAL_MENUS(): PortalMenu[] {
  // The portal's menu IS the platform's navigation, derived from it rather
  // than restated beside it, so the two cannot drift.
  return NAV_SECTIONS.map((section) => {
    const links: PortalLink[] = section.items.map((item) => ({
      label: item.label,
      to: item.to,
      note: item.description,
    }))
    const columns = Math.min(3, Math.max(1, Math.ceil(links.length / 4)))
    const perColumn = Math.ceil(links.length / columns)
    const groups = Array.from({ length: columns }, (_, index) => ({
      links: links.slice(index * perColumn, (index + 1) * perColumn),
    })).filter((group) => group.links.length > 0)
    return { id: section.id, label: section.label, groups }
  })
}

let PORTAL_MENUS: PortalMenu[] = build$PORTAL_MENUS()

function build$QUICK_LINKS(): PortalTile[] {
  // What an OFFICER opens, not what a citizen transacts - one tile per page,
  // named exactly as the menu names it, in the order a working day reaches
  // them.
  return [
    { icon: Gauge, label: t('Commissioner Cockpit'), note: t('What needs attention today, ranked by severity and exposure.'), to: ROUTES.cockpit },
    { icon: FileText, label: t('Decision Centre'), note: t('Every decision waiting on a post, with its evidence assembled.'), to: ROUTES.decisions },
    { icon: IndianRupee, label: t('Project Intelligence'), note: t('Capital works, their money and their physical progress.'), to: ROUTES.projects },
    { icon: Radar, label: t('Situation Room'), note: t('Live incidents, alerts and the response as it stands.'), to: ROUTES.situationRoom },
    { icon: MapPin, label: t('Ward Intelligence'), note: t('Every administrative ward, compared and profiled.'), to: ROUTES.wards },
    { icon: Megaphone, label: t('Grievance Resolution'), note: t('Why problems keep returning, and who should own them.'), to: ROUTES.resolutionIntelligence },
    { icon: Waves, label: t('Monsoon Intelligence'), note: t('Rain on a high tide, flooding spots, pumping stations and nullahs.'), to: ROUTES.monsoon },
    { icon: Droplets, label: t('Water Intelligence'), note: t('From the lakes to the tap - storage, supply and losses.'), to: ROUTES.water },
    { icon: Route, label: t('Roads Intelligence'), note: t('Condition, defects and the explainable priority engine.'), to: ROUTES.roads },
    { icon: Building2, label: t('Revenue Intelligence'), note: t('Collection efficiency, arrears and revenue by stream against target.'), to: ROUTES.revenue },
    { icon: Trash2, label: t('Solid Waste Intelligence'), note: t('Collection, routes, processing and hotspots.'), to: ROUTES.waste },
    { icon: Scale, label: t('Evidence & Audit'), note: t('Every source and figure, traceable to the original record.'), to: ROUTES.evidenceAudit },
  ]
}
let QUICK_LINKS: PortalTile[] = build$QUICK_LINKS()

/* ==========================================================================
   The bands below the fold
   ========================================================================== */

interface PortalSurface {
  icon: LucideIcon
  label: string
  note: string
  to: string
}

function build$SURFACES(): PortalSurface[] {
  return [
    { icon: Gauge, label: t('Commissioner Cockpit'), note: t('What in Mumbai needs attention today, ranked with transparent weights.'), to: ROUTES.cockpit },
    { icon: FileText, label: t('Decision Centre'), note: t('Each signal carried from evidence to a named decision, an action and a measured outcome.'), to: ROUTES.decisions },
    { icon: IndianRupee, label: t('Project Intelligence'), note: t('Capital works - the Coastal Road, flyovers, bridges and drains - mapped and tracked.'), to: ROUTES.projects },
    { icon: Scale, label: t('Scenario Intelligence'), note: t('Pumps, crews, desilting and staffing options compared before deciding.'), to: ROUTES.scenarios },
    { icon: MapPin, label: t('Ward Intelligence'), note: t('Every administrative ward profiled, compared and tracked over time.'), to: ROUTES.wards },
    { icon: CloudRain, label: t('Monsoon Intelligence'), note: t('Heavy rain on a high tide, flooding spots and IMD Mumbai advisories - the season that matters most.'), to: ROUTES.monsoon },
    { icon: Droplets, label: t('Water Intelligence'), note: t('The seven lakes from source to tap, and the sewage treatment that follows.'), to: ROUTES.water },
    { icon: Siren, label: t('Situation Room'), note: t('Live incidents, alerts and signals, and the response as it stands.'), to: ROUTES.situationRoom },
  ]
}
let SURFACES: PortalSurface[] = build$SURFACES()

/* ==========================================================================
   The banner
   ========================================================================== */

interface BannerSlide {
  heading: string
  features: string[]
  action: string
  to: string
  /** The civic photograph that fills the band behind the copy. */
  photo: CoverPhoto
}

function build$BANNER_SLIDES(): BannerSlide[] {
  const unit = municipality.terminology.primaryUnitSingular
  const photos = coverPhotos()
  return [
    {
      heading: municipality.branding.productShortName,
      features: [
        t('One decision surface for every municipal mandate'),
        t('English and Marathi throughout, figures unchanged'),
        t('Every action recorded against the post that took it'),
        t('Deploys to any corporation in the state unchanged'),
      ],
      action: t('See what it decides'),
      to: '#surfaces',
      photo: photos.skylineNight,
    },
    {
      heading: t('The city on one screen, ordered by what needs deciding'),
      features: [
        t('Live incidents, escalations and the control-room picture'),
        t('Each {0} scored on service, equity and delivery', unit),
        t('Rain, tide and flooding spots read together, so a cause is read once'),
        t('Standing resilience picture ahead of the incident'),
      ],
      action: t('Open the commissioner’s cockpit'),
      to: ROUTES.cockpit,
      photo: photos.seaLink,
    },
    {
      heading: t('Every rupee demanded, collected and accounted for'),
      features: [
        t('Demand, collection and arrears against the register'),
        t('A recovery worklist ranked by what is recoverable'),
        t('Contractors read across their whole book of work'),
        t('Budget heads tracked while there is time to spend them'),
      ],
      action: t('Open revenue and finance'),
      to: ROUTES.financialIntelligence,
      photo: photos.bmcHeadOffice,
    },
  ]
}
let BANNER_SLIDES: BannerSlide[] = build$BANNER_SLIDES()

interface CoverageCard {
  photo: CoverPhoto
  title: string
  line: string
  links: Array<{ label: string; to: string }>
}

function buildCoverageCards(): CoverageCard[] {
  const photos = coverPhotos()
  return [
    {
      photo: photos.mithiRiver,
      title: t('Rivers, nullahs & storm water'),
      line: t('The Mithi and the city’s nullahs, pumping stations, flooding spots and the subways that flood first.'),
      links: [
        { label: t('Storm Water Intelligence'), to: ROUTES.stormwater },
        { label: t('Monsoon Intelligence'), to: ROUTES.monsoon },
      ],
    },
    {
      photo: photos.monsoonColaba,
      title: t('Monsoon & Arabian Sea cyclones'),
      line: t('IMD Mumbai advisories, shelters, pre-positioned resources and ward exposure.'),
      links: [
        { label: t('Monsoon Intelligence'), to: ROUTES.monsoon },
        { label: t('Disaster Intelligence'), to: ROUTES.disaster },
      ],
    },
    {
      photo: photos.viharLake,
      title: t('Water supply & sewage treatment'),
      line: t('The seven lakes that feed the city, from storage to the tap, and the treatment plants downstream.'),
      links: [
        { label: t('Water Intelligence'), to: ROUTES.water },
        { label: t('Solid Waste Intelligence'), to: ROUTES.waste },
      ],
    },
    {
      photo: photos.marineDrive,
      title: t('Roads, street lighting & bridges'),
      line: t('Road defects, potholes, flyovers, street lights and the works that dig them up.'),
      links: [
        { label: t('Roads Intelligence'), to: ROUTES.roads },
        { label: t('Traffic & Mobility'), to: ROUTES.traffic },
      ],
    },
    {
      photo: photos.bestBus,
      title: t('Mobility & the city map'),
      line: t('Incidents, works and wards on a real map of Mumbai.'),
      links: [
        { label: t('City Command Map'), to: ROUTES.cityCommandMap },
        { label: t('Urban Digital Twin'), to: ROUTES.digitalTwin },
      ],
    },
    {
      photo: photos.coastalRoad,
      title: t('Capital works & contractors'),
      line: t('Project risk, delivery, contractor records and coordination.'),
      links: [
        { label: t('Project Intelligence'), to: ROUTES.projects },
        { label: t('Procurement Intelligence'), to: ROUTES.procurement },
      ],
    },
    {
      photo: photos.chowpatty,
      title: t('Festivals, crowds & public spaces'),
      line: t('Ganeshotsav immersions, beaches, gardens and the places the city gathers.'),
      links: [
        { label: t('Gardens & Open Space'), to: ROUTES.gardens },
        { label: t('Situation Room'), to: ROUTES.situationRoom },
      ],
    },
    {
      photo: photos.localTrain,
      title: t('Citizen services & ward offices'),
      line: t('Service requests, certificates, the citizen facilitation centres and grievance resolution.'),
      links: [
        { label: t('Citizen Service Intelligence'), to: ROUTES.citizenServices },
        { label: t('Grievance Resolution'), to: ROUTES.resolutionIntelligence },
      ],
    },
    {
      photo: photos.bkc,
      title: t('Wards & localities'),
      line: t('All {0} administrative wards scored on service, equity and delivery.', formatNumber(municipality.administrativeUnits.wards)),
      links: [
        { label: t('Ward Intelligence'), to: ROUTES.wards },
        { label: t('Ward Equity & Allocation'), to: ROUTES.wardEquity },
      ],
    },
    {
      photo: photos.crawfordMarket,
      title: t('Revenue & municipal finance'),
      line: t('Property tax, collection, arrears, markets and the corporation’s budget.'),
      links: [
        { label: t('Revenue Intelligence'), to: ROUTES.revenue },
        { label: t('Budget Intelligence'), to: ROUTES.budget },
      ],
    },
    {
      photo: photos.skylineNight,
      title: t('Command centre & decisions'),
      line: t('The whole city on one screen, ranked by what needs deciding.'),
      links: [
        { label: t('Executive Overview'), to: ROUTES.executive },
        { label: t('Decision Centre'), to: ROUTES.decisions },
      ],
    },
    {
      photo: photos.bmcHeadOffice,
      title: t('Council resolutions & establishment'),
      line: t('Implementation of every corporation and committee resolution, and the staff behind it.'),
      links: [
        { label: t('Council & Committees'), to: ROUTES.councilResolutions },
        { label: t('Workforce Intelligence'), to: ROUTES.workforce },
      ],
    },
  ]
}

/**
 * Every photograph of Mumbai on this page, with the credit its licence asks
 * for. The same records, with source links, are in
 * `public/cover/PHOTO-CREDITS.txt`.
 */
function buildGallery(): CoverPhoto[] {
  const p = coverPhotos()
  return [
    p.flamingos,
    p.skylineNight,
    p.seaLink,
    p.csmt,
    p.viharLake,
    p.bmcHeadOffice,
    p.marineDrive,
    p.powaiRain,
    p.bestBus,
    p.crawfordMarket,
    p.chowpatty,
    p.coastalRoad,
    p.monsoonColaba,
    p.hangingGardens,
  ]
}

interface PortalAssurance {
  label: string
  note: string
  linkLabel: string
  to: string
}

function build$ASSURANCES(): PortalAssurance[] {
  return [
    {
      label: t('Sovereign by deployment'),
      note: t('No AI model or citizen data leaves the deployment; base-map tiles come from OpenStreetMap.'),
      linkLabel: t('Security posture'),
      to: ROUTES.security,
    },
    {
      label: t('Answerable by position'),
      note: t('Sign-in is by the post held, not by the person. The post carries the authority and the data scope, and the officer is named against every action taken under it.'),
      linkLabel: t('Access and roles'),
      to: ROUTES.accessGovernance,
    },
    {
      label: t('Provenance on every figure'),
      note: t('Each surface states where its numbers came from and which of them are modelled. Nothing is presented as an observation it is not.'),
      linkLabel: t('Trust Centre'),
      to: ROUTES.trustCentre,
    },
    {
      label: t('AI that shows its working'),
      note: t('A recommendation arrives with its inputs, its confidence and the post that is permitted to act on it. An officer decides; the platform never does.'),
      linkLabel: t('AI governance'),
      to: ROUTES.aiGovernance,
    },
  ]
}
let ASSURANCES: PortalAssurance[] = build$ASSURANCES()

interface PortalTile {
  icon: LucideIcon
  label: string
  note: string
  to: string
  /** Flags the notice as newly published. Only the notice board sets it. */
  isNew?: boolean
}

/** The two feature cards that lead the notice board. */
interface NoticeFeature {
  /** A civic photograph, set across the head of the card. */
  photo: CoverPhoto
  title: string
  blurb: string
  to: string
}

function build$NOTICE_FEATURES(): NoticeFeature[] {
  const photos = coverPhotos()
  return [
    {
      photo: photos.csmt,
      title: t('How access is granted'),
      blurb: t('Sign-in is by the post held, not by the person. The post carries the authority and the data scope, and the officer is named against every action taken under it.'),
      to: ROUTES.accessGovernance,
    },
    {
      photo: photos.powaiRain,
      title: t('Where every figure comes from'),
      blurb: t('Each surface states the source of its numbers and which of them are modelled. An officer who cannot cite a figure in a meeting cannot use it.'),
      to: ROUTES.evidenceAudit,
    },
  ]
}
let NOTICE_FEATURES: NoticeFeature[] = build$NOTICE_FEATURES()

interface NoticeTab {
  id: string
  label: string
  items: PortalTile[]
}

function build$NOTICE_TABS(): NoticeTab[] {
  const unit = municipality.terminology.primaryUnitSingular
  return [
    {
      id: 'new',
      label: t('New'),
      items: [
        { icon: MapPin, label: t('{0} equity and allocation', unit), note: t('Allocation read against need rather than against last year.'), to: ROUTES.wardEquity, isNew: true },
        { icon: MessageCircle, label: t('Municipal Copilot on procurement'), note: t('Contractor performance and tender history, asked in plain language.'), to: ROUTES.copilot, isNew: true },
        { icon: Radar, label: t('Integration health'), note: t('Which departmental feed is stale, and since when.'), to: ROUTES.integrations, isNew: true },
        { icon: CloudRain, label: t('Monsoon scenario workspace'), note: t('What the city looks like under a heavier spell on a higher tide than last year.'), to: ROUTES.scenarios, isNew: true },
      ],
    },
    {
      id: 'circulars',
      label: t('Circulars'),
      items: [
        { icon: FileText, label: t('Standing orders and circulars'), note: t('The orders in force, and the ones each of them supersedes.'), to: ROUTES.correspondence },
        { icon: Landmark, label: t('Government resolutions'), note: t('Government resolutions (GRs) of the Urban Development Department, and what each obliges the corporation to do.'), to: ROUTES.correspondence },
        { icon: Scale, label: t('Delegation of powers'), note: t('Which post may sanction what, and up to what value.'), to: ROUTES.accessGovernance },
        { icon: Megaphone, label: t('Right to Public Services timelines'), note: t('The time each notified service must be delivered in, under the Maharashtra Right to Public Services Act, 2015.'), to: ROUTES.citizenServices },
      ],
    },
    {
      id: 'escalations',
      label: t('Escalations'),
      items: [
        { icon: Gauge, label: t('Decisions awaiting approval'), note: t('Sitting with a post, with the evidence already assembled.'), to: ROUTES.decisions, isNew: true },
        { icon: Siren, label: t('Alerts past their standard'), note: t('Beyond their window, and now with the department head.'), to: ROUTES.alerts },
        { icon: Megaphone, label: t('Complaints breaching today'), note: t('Due to breach the charter before the day closes.'), to: ROUTES.citizenServices },
        { icon: Building2, label: t('Works behind schedule'), note: t('Physical progress trailing the money already released.'), to: ROUTES.projects },
      ],
    },
    {
      id: 'reference',
      label: t('Reference'),
      items: [
        { icon: Rss, label: t('Data sources'), note: t('Every feed, its owner, and when it last landed.'), to: ROUTES.dataSources },
        { icon: Radar, label: t('Model registry'), note: t('What each model does, and how it scored on evaluation.'), to: ROUTES.modelRegistry },
        { icon: Route, label: t('Lineage of a figure'), note: t('From the screen back to the record it was drawn from.'), to: ROUTES.lineage },
        { icon: Scale, label: t('Access and roles'), note: t('The scope each position carries, and who granted it.'), to: ROUTES.accessGovernance },
      ],
    },
  ]
}
let NOTICE_TABS: NoticeTab[] = build$NOTICE_TABS()

/**
 * The four Google brand hues, cycled across the columns.
 *
 * The grids run four across at `lg`, so index modulo four gives each COLUMN its
 * own hue rather than scattering colour through the rows - which is what makes
 * it read as an infographic rather than as decoration.
 *
 * Written as whole class strings rather than composed from a hue name, because
 * Tailwind scans source text for class names and a template literal would name
 * classes it never generates.
 */
const COLUMN_HUES = [
  'bg-google-blue-600 text-white',
  'bg-google-red-600 text-white',
  // Yellow takes a dark glyph: white on Google's yellow never clears 3:1.
  'bg-google-yellow-500 text-ink-900',
  'bg-google-green-700 text-white',
] as const

/**
 * The same four hues as `COLUMN_HUES`, read at a whisper instead of a shout -
 * a pale wash for the CARD ITSELF, indexed the same way so a tile's ground
 * always carries the same hue as its own icon badge.
 */
const CARD_WASH = [
  'bg-google-blue-50',
  'bg-google-red-50',
  'bg-google-yellow-50',
  'bg-google-green-50',
] as const

const CARD_WASH_HOVER = [
  'bg-google-blue-50 hover:bg-google-blue-100',
  'bg-google-red-50 hover:bg-google-red-100',
  'bg-google-yellow-50 hover:bg-google-yellow-100',
  'bg-google-green-50 hover:bg-google-green-100',
] as const

/** The assurance cards' top rule, in the same column order as `COLUMN_HUES`. */
const ASSURANCE_BARS = [
  'bg-google-blue-600',
  'bg-google-red-600',
  'bg-google-yellow-500',
  'bg-google-green-700',
] as const

/** Paired one-to-one with `CARD_WASH`, for the two-item notice feature cards. */
const NOTICE_ACCENT = ['border-b-google-blue-600', 'border-b-google-red-600'] as const

/** The hero's own bullet markers, cycled the same way. */
const HERO_DOT_HUES = [
  'bg-google-blue-400',
  'bg-google-red-400',
  'bg-google-yellow-400',
  'bg-google-green-400',
] as const

/**
 * The important-links grid: separate cards with the icon on the LEFT and the
 * label beside it. Colour lives in the icon badge and a pale wash of the same
 * hue, so the four Google hues code the columns.
 */
function PortalLinkGrid({ tiles, isAuthenticated }: { tiles: PortalTile[]; isAuthenticated: boolean }): React.JSX.Element {
  return (
    <ul className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {tiles.map((tile, index) => (
        <li key={tile.label}>
          <a
            href={signInFor(tile.to, isAuthenticated)}
            className={cn(
              'interactive-surface flex h-full items-center gap-3 rounded-lg border border-ink-200 px-4 py-3.5 shadow-card transition-colors',
              CARD_WASH_HOVER[index % CARD_WASH_HOVER.length],
            )}
          >
            <span
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                COLUMN_HUES[index % COLUMN_HUES.length],
              )}
              aria-hidden
            >
              <tile.icon className="h-5 w-5" />
            </span>
            <span className="min-w-0 text-[0.8125rem] leading-snug font-semibold break-words text-ink-800">{tile.label}</span>
            {tile.isNew ? (
              <span className="ml-auto shrink-0 rounded-sm bg-crit-500 px-1.5 py-0.5 text-[0.625rem] font-bold tracking-[0.08em] text-white uppercase">
                {t('New')}
              </span>
            ) : null}
          </a>
        </li>
      ))}
    </ul>
  )
}

/**
 * A photograph laid behind a dark band, under a navy wash heavy enough that
 * white copy over it clears contrast wherever the picture is bright.
 * Decorative: the band's own heading carries the meaning, and the photograph
 * is captioned beside it with `PhotoCaption`.
 */
function PhotoBackdrop({ photo }: { photo: CoverPhoto }): React.JSX.Element {
  return (
    <div aria-hidden className="absolute inset-0 -z-10">
      <img
        src={photo.src}
        alt=""
        loading="lazy"
        decoding="async"
        style={{ objectPosition: photo.focus }}
        className="h-full w-full object-cover"
      />
      <span className="absolute inset-0 bg-gradient-to-r from-[#0b1636]/90 via-[#0f2257]/65 to-[#0b1636]/35" />
    </div>
  )
}

/** What a backdrop photograph shows, set small in the band's corner. */
function PhotoCaption({ caption }: { caption: string }): React.JSX.Element {
  return (
    <p className="inline-flex w-fit items-center gap-1.5 rounded-full bg-black/30 px-3 py-1 text-[0.625rem] text-white/75 ring-1 ring-white/15 backdrop-blur">
      <Camera className="h-3 w-3" aria-hidden />
      {t('Photo: {0}', caption)}
    </p>
  )
}

registerLayer(() => {
  PORTAL_MENUS = build$PORTAL_MENUS()
  QUICK_LINKS = build$QUICK_LINKS()
  SURFACES = build$SURFACES()
  BANNER_SLIDES = build$BANNER_SLIDES()
  ASSURANCES = build$ASSURANCES()
  NOTICE_FEATURES = build$NOTICE_FEATURES()
  NOTICE_TABS = build$NOTICE_TABS()
})

/* ==========================================================================
   Page
   ========================================================================== */

export function PortalLandingPage(): React.JSX.Element {
  const navigate = useNavigate()
  const corporation = useActiveCorporation()
  const locale = useApplyLocale()
  // Whether this visit already carries a session - decides, per link below,
  // whether a destination is reached directly or must detour through sign-in
  // first. See `signInFor`.
  const isAuthenticated = useCurrentUser() !== null
  const coverageCards = buildCoverageCards()
  const gallery = buildGallery()
  const photos = coverPhotos()
  /* Headline figures for the hero. Every value is read from the corporation
     record (src/config/corporations.ts), where each carries its source. */
  const heroFacts = [
    {
      label: t('Residents in corporation limits'),
      value: formatNumber(corporation.population2011),
      source: t('Census of India 2011'),
    },
    {
      label: t('Corporator seats'),
      value: corporation.electoralWards ? formatNumber(corporation.electoralWards) : '—',
      source: t('Elected corporators'),
    },
    {
      label: t('Budget {0}', corporation.budgetFinancialYear ?? ''),
      value: corporation.budgetCrore ? t('₹{0} cr', formatNumber(corporation.budgetCrore, 2)) : '—',
      source: t('Approved by the General Body'),
    },
    {
      label: t('Water supplied daily'),
      value: corporation.waterSupplyMLD ? t('{0} MLD', formatNumber(corporation.waterSupplyMLD)) : '—',
      source: t('Reported daily supply'),
    },
    {
      label: t('Area'),
      value: t('{0} km²', formatNumber(corporation.areaSqKm, 2)),
      source: t('Corporation jurisdiction'),
    },
    {
      label: t('Administrative wards'),
      value: formatNumber(corporation.administrativeWards ?? municipality.administrativeUnits.wards),
      source: t('Ward offices of the corporation'),
    },
    {
      label: t('Sewage treatment'),
      value: corporation.sewageTreatmentMLD ? t('{0} MLD', formatNumber(corporation.sewageTreatmentMLD)) : '—',
      source: t('Combined treatment capacity'),
    },
  ].filter((fact) => fact.value !== '—')

  const [query, setQuery] = useState('')
  const [fontStep, setFontStep] = useState(0)
  const [feedPaused, setFeedPaused] = useState(false)
  const [bannerSlide, setBannerSlide] = useState(0)
  const [bannerPaused, setBannerPaused] = useState(false)
  const [noticeTab, setNoticeTab] = useState(NOTICE_TABS[0]?.id ?? 'new')

  // The related-links carousel runs four to a page and wraps at both ends.
  // The page is clamped on read rather than reset in an effect: a language
  // switch rebuilds the catalogue, and a carousel parked past the last page
  // would render an empty band until the reader happened to press an arrow.

  /**
   * The banner's rotation.
   *
   * Seven seconds, which is long enough to read four bullets and short enough
   * that a visitor who ignores the dots still sees the second argument.
   *
   * Three things stop it: hover, focus inside the band, and a reduced-motion
   * preference. The last is not a nicety - a slide that changes under a
   * reader who cannot dismiss it is the failure mode this pattern is known
   * for, so a stated preference for less motion stops it outright rather than
   * merely shortening the fade.
   */
  useEffect(() => {
    if (bannerPaused || BANNER_SLIDES.length < 2) return
    const root = document.documentElement
    const stillPreferred =
      root.dataset.motion === 'reduced' ||
      (root.dataset.motion !== 'full' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    if (stillPreferred) return
    const timer = window.setInterval(() => {
      setBannerSlide((current) => (current + 1) % BANNER_SLIDES.length)
    }, 7000)
    return () => window.clearInterval(timer)
  }, [bannerPaused, locale])

  /**
   * The A- / A / A+ control, doing what the equivalent control on a government
   * portal does: it moves the root font size, so every rem-based measurement
   * on the page scales with it rather than only the body copy.
   */
  useEffect(() => {
    const root = document.documentElement
    const previous = root.style.fontSize
    root.style.fontSize = fontStep === 0 ? '' : `${100 + fontStep * 12.5}%`
    return () => {
      root.style.fontSize = previous
    }
  }, [fontStep])

  /**
   * Visitor counters and the what's-new list.
   *
   * Deterministic and seeded by corporation, like every other figure in the
   * platform: a counter that moved on each render would be the one number on
   * the page that could not be reproduced in a screenshot.
   */
  const counters = useMemo(() => {
    const r = det('portal:counters')
    return {
      today: r.int(21_000, 96_000),
      total: r.int(4_200_000, 31_000_000),
    }
  }, [])

  /**
   * The live update line.
   *
   * What a corporation actually publishes to a scrolling notice line: the
   * control room that is manned right now, a supply interruption, the works in
   * progress, and the two or three dates that carry a deadline for a citizen.
   *
   * PUBLIC NOTICES ONLY. This band sits ahead of sign-in, so nothing on it may
   * be drawn from the intelligence surfaces behind it - the items here are the
   * kind a corporation already publishes on its own portal, and no more.
   *
   * MODELLED, and labelled so on the strip itself. No corporation notice feed
   * is connected: every count is a deterministic demonstration value, and a
   * reader must never take one for a published corporation bulletin.
   *
   * Seeded by corporation and dated off the demonstration anchor like every
   * other figure on this page. The line moves; the numbers on it do not, so a
   * screenshot taken a minute apart still reconciles.
   */
  const liveUpdates = useMemo(() => {
    const r = det('portal:live-feed')
    const division = corporation.divisions[0]?.name
    const wastePerDay = corporation.solidWasteTPD
    // Annotated rather than inferred: ROUTES entries are literal types, and
    // without this the two conditional notices widen the element type into a
    // union the filter below cannot narrow.
    const notices: Array<{ label: string; to: string } | null> = [
      {
        label: t('{0} decisions are waiting on an approval in the Decision Centre', formatNumber(r.int(4, 31))),
        to: ROUTES.decisions,
      },
      {
        label: t('{0} alerts have escalated past their standard and sit with department heads', formatNumber(r.int(2, 19))),
        to: ROUTES.alerts,
      },
      {
        label: t('{0} complaints are due to breach the citizens’ charter today', formatNumber(r.int(12, 240))),
        to: ROUTES.citizenServices,
      },
      division
        ? {
            label: t('Pre-monsoon desilting is behind target on the reaches through {0}', division),
            to: ROUTES.stormwater,
          }
        : null,
      {
        label: t('Property tax collection review with zone officers on {0}', formatDate(isoDaysFromAnchor(3))),
        to: ROUTES.property,
      },
      {
        label: t('{0} tenders at technical evaluation, corrigenda published {1}', formatNumber(r.int(11, 74)), formatDate(isoDaysFromAnchor(-1))),
        to: ROUTES.procurement,
      },
      wastePerDay
        ? {
            label: t('Collection coverage is below standard on {0} routes', formatNumber(r.int(3, 26))),
            to: ROUTES.waste,
          }
        : null,
      {
        label: t('Draft budget {0} is before the standing committee', corporation.budgetFinancialYear ?? '2026-27'),
        to: ROUTES.budget,
      },
    ]
    return notices.filter((item): item is { label: string; to: string } => item !== null)
  }, [corporation])

  /** The search box filters the published service directory as it is typed. */
  const matchingLinks = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length === 0) return []
    const byLabel = new Map<string, PortalLink>()
    for (const menu of PORTAL_MENUS) {
      for (const group of menu.groups) {
        for (const link of group.links) {
          if (link.label.toLowerCase().includes(q) && !byLabel.has(link.label)) byLabel.set(link.label, link)
        }
      }
    }
    return [...byLabel.values()].slice(0, 8)
  }, [query])

  /*
   * Anywhere on the page that is not itself a control opens the console.
   *
   * The redirect that used to stand here — bounce an authenticated visitor
   * straight to `/` — was correct while the portal was public and a signed-in
   * officer had no business on it. The portal is now the page sign-in lands on,
   * so that guard would have bounced every officer off it immediately.
   *
   * The guard below is what makes "click anywhere" safe: a click that landed on
   * a link, a button, an input or anything inside one is that control's click,
   * not the page's. Without it, opening a menu or typing in the search box
   * would navigate away instead — the page would be unusable rather than
   * convenient. `closest` walks up from the actual target, so a click on the
   * icon inside a button still counts as the button's.
   */
  const enterConsole = (event: React.MouseEvent<HTMLDivElement>): void => {
    const target = event.target as HTMLElement | null
    if (target?.closest('a, button, input, select, textarea, label, [role="button"], [role="link"]')) return
    navigate('/')
  }

  return (
    <div key={locale} className="min-h-screen bg-canvas" onClick={enterConsole}>
      <a
        href="#portal-main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-govt-700 focus:px-3 focus:py-2 focus:text-xs focus:font-semibold focus:text-white"
      >
        {t('Skip to main content')}
      </a>

      {/* ============================================================ */}
      {/* Utility strip                                                */}
      {/* ============================================================ */}
      {/* A solid deep-blue utility bar, the band Indian government portals
          (GIGW-pattern sites) open on - an officer arriving here should land
          on a shape they already know. The controls inside it are unchanged;
          only the ground they sit on is. */}
      <div className="bg-navy-950 text-white">
        <div className="mx-auto flex max-w-[80rem] flex-wrap items-center justify-between gap-2 px-4 py-1.5">
          <div className="flex items-center gap-3">
            <span className="text-[0.6875rem] font-medium text-white/90">
              {t('Government of {0}', municipality.state)}
            </span>
            <EnvironmentBadge />
          </div>
          <div className="flex items-center gap-3">
            {/* Text sizing, as every government portal in the country carries it. */}
            <div className="flex items-center gap-1" role="group" aria-label={t('Text size')}>
              {([-1, 0, 1] as const).map((step) => (
                <button
                  key={step}
                  type="button"
                  onClick={() => setFontStep(step)}
                  aria-pressed={fontStep === step}
                  className={cn(
                    'rounded px-1.5 py-0.5 text-[0.6875rem] font-semibold transition-colors',
                    fontStep === step
                      ? 'bg-gold-500 text-portal-950'
                      : 'text-white/80 hover:bg-white/15 hover:text-white',
                  )}
                  title={step === -1 ? t('Decrease text size') : step === 0 ? t('Normal text size') : t('Increase text size')}
                >
                  {step === -1 ? 'A-' : step === 0 ? 'A' : 'A+'}
                </button>
              ))}
            </div>
            <span aria-hidden className="h-3 w-px bg-white/25" />
            <div className="flex items-center gap-1.5 text-white/70">
              {([['share', Share2], ['handle', AtSign], ['feed', Rss]] as const).map(([id, Icon]) => (
                <span key={id} className="rounded p-0.5" aria-hidden>
                  <Icon className="h-3.5 w-3.5" />
                </span>
              ))}
            </div>
            <span aria-hidden className="h-3 w-px bg-white/25" />
            <LanguageSwitcher />
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* Live update line                                             */}
      {/* ============================================================ */}
      {/* Pinned to the top of the viewport, and carried on the corporation's
          deep portal blue rather than the pale tint it used to sit on.

          Sticky because a live notice line that scrolls away stops being live
          the moment a visitor reads past it - the whole reason it moves is to
          stay in view. `z-30` puts it above the page's own content and below
          the sign-in dialog, so an open dialog is never underlapped by a
          moving strip.

          Dark because the label had to read white, and white on the previous
          #f2f7fc was invisible. Inverting the strip keeps the contrast well
          clear of the WCAG AA floor in both directions rather than trading one
          unreadable combination for another. */}
      <div className="sticky top-0 z-30 border-b border-navy-950 bg-navy-900 shadow-sm">
        <div className="mx-auto flex max-w-[80rem] items-center gap-2.5 px-4 py-1.5">
          <span className="flex shrink-0 items-center gap-1.5 rounded-sm bg-crit-500 px-1.5 py-0.5 text-[0.625rem] font-bold tracking-[0.08em] text-white uppercase ring-1 ring-crit-300 ring-inset">
            <span aria-hidden className="animate-pulse-soft h-1.5 w-1.5 rounded-full bg-white" />
            {t('Live')}
          </span>
          <span className="hidden shrink-0 text-[0.6875rem] font-semibold text-white sm:inline">
            {t('Latest updates')}
          </span>
          {/* The notices are modelled, and the strip says so where they are
              read rather than only in the footer. */}
          <span
            className="shrink-0 rounded-sm bg-white/15 px-1.5 py-0.5 text-[0.625rem] font-semibold tracking-[0.06em] text-white/85 uppercase ring-1 ring-white/25 ring-inset"
            title={t('Demonstration notices, modelled. Not published by the corporation.')}
          >
            {t('Modelled')}
          </span>

          <div className="marquee-viewport relative min-w-0 flex-1">
            {/* The notices are laid out twice. The first list is the one that
                is read - by a screen reader, and by the tab key. The second
                exists only so the loop has something to show at the seam, so
                it is hidden from assistive technology and taken out of the tab
                order rather than presenting every notice on the page twice. */}
            <div
              className="marquee-track"
              data-paused={feedPaused}
              style={{ '--marquee-duration': `${liveUpdates.length * 9}s` } as React.CSSProperties}
            >
              {([false, true] as const).map((isLoopCopy) => (
                <ul
                  key={String(isLoopCopy)}
                  className={cn('flex shrink-0 items-center', isLoopCopy && 'marquee-loop-copy')}
                  aria-hidden={isLoopCopy || undefined}
                >
                  {liveUpdates.map((item) => (
                    <li key={item.label} className="flex items-center">
                      <a
                        href={signInFor(item.to, isAuthenticated)}
                        tabIndex={isLoopCopy ? -1 : undefined}
                        className="px-3 py-0.5 text-[0.75rem] whitespace-nowrap text-white/90 hover:text-white hover:underline"
                      >
                        {item.label}
                      </a>
                      <span aria-hidden className="h-1 w-1 shrink-0 rounded-full bg-white/40" />
                    </li>
                  ))}
                </ul>
              ))}
            </div>
          </div>

          {/* Moving text must be stoppable, and hovering it is not a control a
              keyboard or a touch screen has. */}
          <button
            type="button"
            onClick={() => setFeedPaused((paused) => !paused)}
            aria-pressed={feedPaused}
            aria-label={feedPaused ? t('Resume the update line') : t('Pause the update line')}
            title={feedPaused ? t('Resume the update line') : t('Pause the update line')}
            className="shrink-0 rounded p-1 text-white/70 transition-colors hover:bg-white/15 hover:text-white"
          >
            {feedPaused ? <Play className="h-3.5 w-3.5" aria-hidden /> : <Pause className="h-3.5 w-3.5" aria-hidden />}
          </button>
        </div>
      </div>

      {/* ============================================================ */}
      {/* Masthead                                                     */}
      {/* ============================================================ */}
      {/* A WHITE masthead under the blue utility strip, closed by the gold
          rule that separates the whole header from the hero. The internal
          module menu that used to sit below it was dropped: this page is the
          public storefront, and a visitor who has not signed in has nowhere
          to go with "Command Centre" or "Resolution Intelligence" as a link.

          Carried on white, the masthead earns its authority from weight and a
          hairline of gold rather than from colour — which is what lets the
          corporation's identity read as a letterhead instead of as one more
          coloured bar. It was briefly set on blue, which merged it into the
          chrome above and below it and gave the top of the page four
          consecutive bands of the same colour before any content appeared.

          The elements that carried weight on blue are re-weighted back: the
          seal keeps its gold ring, the deployment label is a light inset with
          a gold stub rather than a translucent one, and the helpline stays a
          solid red chip so it remains the urgent thing on the band. */}
      <header className="border-b-[3px] border-gold-500 bg-surface">
        <div className="mx-auto flex max-w-[80rem] flex-col gap-4 px-4 py-5 md:flex-row md:items-center md:justify-between">
          {/* The masthead leads with the PLATFORM, not with the corporation.
              The core is deployment-neutral, and a masthead reading only
              "Brihanmumbai Municipal Corporation" would tell every visitor the
              opposite - that they were looking at the corporation's own site.
              The corporation is still named, one line down, as the deployment
              this render is for. Which is what it is. */}
          <div className="flex min-w-0 items-center gap-4">
            {/* Ringed in gold rather than in grey: on the reference portal the
                seal is the one element allowed to carry the civic accent. */}
            <img
              src={municipality.branding.markPath}
              alt=""
              className="h-16 w-16 shrink-0 rounded-md object-cover ring-2 ring-gold-500/70"
            />
            <div className="min-w-0">
              <p className="truncate text-[1.3125rem] leading-tight font-bold tracking-[-0.01em] text-ink-900">
                {municipality.branding.productFamily}
              </p>
              <p className="mt-0.5 truncate text-[0.875rem] leading-tight font-medium text-ink-600">
                {t('Government of {0} · Urban Development Department', municipality.state)}
              </p>
              {/* The deployment line is what the reference portal would print
                  as its office identifier: set off by a gold stub, not by a
                  status dot, so it reads as an institutional label rather than
                  as telemetry about a running system. */}
              <p className="mt-1.5 flex min-w-0 items-center gap-2 border-l-[3px] border-gold-400 bg-ink-50 py-0.5 pr-2 pl-2 text-[0.75rem] font-medium text-ink-700">
                <span className="truncate">{t('Deployment: {0}', corporationName(corporation))}</span>
              </p>
            </div>
          </div>

          <div className="flex flex-col items-stretch gap-2 md:items-end">
            {/* 112 is India's single national emergency number and is answered
                in Maharashtra. The corporation's own complaint line is not
                printed here: this demonstration holds no verified number for it. */}
            <a
              href={`tel:112`}
              className="inline-flex items-center gap-2 self-start rounded-md bg-crit-500 px-2.5 py-1 text-[0.75rem] font-semibold text-white ring-1 ring-crit-300 ring-inset md:self-auto"
            >
              <Phone className="h-3.5 w-3.5" aria-hidden />
              {t('Emergency 112')}
            </a>
            <div className="relative w-full md:w-72">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('Search services and information')}
                aria-label={t('Search services and information')}
                className="w-full rounded-md border border-ink-200 bg-surface py-1.5 pr-3 pl-8 text-[0.8125rem] text-ink-800 placeholder:text-ink-400 focus:border-portal-500 focus:ring-1 focus:ring-portal-500 focus:outline-none"
              />
              {matchingLinks.length > 0 ? (
                <ul className="absolute top-full right-0 left-0 z-30 mt-1 overflow-hidden rounded-md border border-ink-200 bg-surface shadow-drawer">
                  {matchingLinks.map((link) =>
                    link.to ? (
                      <li key={link.label}>
                        <a href={signInFor(link.to, isAuthenticated)} className="block px-3 py-1.5 text-[0.75rem] text-portal-700 hover:bg-portal-50">
                          {link.label}
                        </a>
                      </li>
                    ) : (
                      <li key={link.label} className="px-3 py-1.5 text-[0.75rem] text-ink-500" title={link.note}>
                        {link.label}
                      </li>
                    ),
                  )}
                </ul>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      {/* ============================================================ */}
      {/* Hero band                                                    */}
      {/* ============================================================ */}
      <main id="portal-main">
        {/* The gold rule a government masthead sits on. Two pixels, and it is
            what separates an institutional page from a product page. */}
        <div aria-hidden className="civic-rule" />

        {/* The campaign banner, built to the form the corporation's own live
            portal carries: a full-bleed coloured band roughly a third of the
            viewport tall, copy on the left, a photographic collage on the
            right, and a pale wave along the bottom edge with a city skyline
            standing on it.

            It ROTATES. The reference band changes campaign; ours changes the
            argument it is making, which is the closest honest equivalent -
            three slides, cross-faded, paused on hover, on focus, and under a
            reduced-motion preference.

            The heading of the first slide is the page's `h1`. Carousels and
            document outlines do not sit together comfortably: the alternative
            is a hidden `h1` duplicating text a sighted reader can already
            see, which is worse. Inactive slides are hidden from assistive
            technology and taken out of the tab order, so only one slide is
            ever readable or reachable. */}
        {/* `role="group"` rather than the implicit `region` a named <section>
            would otherwise be: the carousel pattern in the ARIA practices asks
            for a group where the carousel is not itself a landmark, and this
            band is promotion rather than a landmark worth listing beside
            `main`. */}
        <section
          className="mcgm-band"
          role="group"
          aria-roledescription={t('Carousel')}
          aria-label={t('Platform highlights')}
        >
          {/* The pause handlers sit on the slide track rather than on the
              <section>. A named section is a non-interactive landmark and the
              wrong host for a mouse listener - the a11y rule is right about
              that, and it is not a rule worth silencing, because the fix is
              also better behaviour: the track is the part a reader is
              actually pointing at, and the decorative wave below it no longer
              counts as hovering the carousel. */}
          {/* Full-bleed photographs of Mumbai, cross-fading with the slides
              they belong to. Decorative: the copy carries the meaning. */}
          <div aria-hidden className="absolute inset-0 -z-10">
            {BANNER_SLIDES.map((slide, index) => (
              <img
                key={slide.heading}
                src={slide.photo.src}
                alt=""
                loading={index === 0 ? 'eager' : 'lazy'}
                decoding="async"
                style={{ objectPosition: slide.photo.focus }}
                className={cn(
                  'absolute inset-0 h-full w-full object-cover transition-opacity duration-700',
                  index === bannerSlide ? 'opacity-100' : 'opacity-0',
                )}
              />
            ))}
            <span className="absolute inset-0 bg-gradient-to-r from-[#0b1636]/95 via-[#0f2257]/80 to-[#0f2257]/25" />
            <span className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#0b1636]/80 to-transparent" />
          </div>

          <div
            className="mx-auto grid max-w-[80rem] grid-cols-1 px-4 pt-14 pb-14 lg:pt-20 lg:pb-20"
            onMouseEnter={() => setBannerPaused(true)}
            onMouseLeave={() => setBannerPaused(false)}
            onFocusCapture={() => setBannerPaused(true)}
            onBlurCapture={() => setBannerPaused(false)}
          >
            {BANNER_SLIDES.map((slide, index) => {
              const active = index === bannerSlide
              const Heading = index === 0 ? 'h1' : 'p'
              return (
                <div
                  key={slide.heading}
                  className="mcgm-slide grid grid-cols-1 items-center gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]"
                  data-active={active}
                  aria-hidden={!active}
                >
                  <div className="min-w-0">
                    <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[0.6875rem] font-bold tracking-[0.14em] text-white uppercase ring-1 ring-white/25 backdrop-blur">
                      {t('{0} · Maharashtra', corporationName(corporation))}
                    </p>
                    <Heading className="mt-5 max-w-2xl text-[clamp(2rem,4.2vw,3.4rem)] leading-[1.08] font-extrabold tracking-[-0.025em] text-white drop-shadow-[0_2px_12px_rgb(0_0_0/0.45)]">
                      {slide.heading}
                    </Heading>

                    <ul className="mt-7 grid max-w-2xl grid-cols-1 gap-2.5 sm:grid-cols-2">
                      {slide.features.map((feature, featureIndex) => (
                        <li
                          key={feature}
                          className="flex items-start gap-2.5 rounded-lg bg-white/10 px-3 py-2 text-[0.875rem] leading-snug text-white/95 ring-1 ring-white/15 backdrop-blur-sm"
                        >
                          <span
                            aria-hidden
                            className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', HERO_DOT_HUES[featureIndex % HERO_DOT_HUES.length])}
                          />
                          {feature}
                        </li>
                      ))}
                    </ul>

                    <div className="mt-8 flex flex-wrap items-center gap-3">
                      <a
                        href={signInFor(slide.to, isAuthenticated)}
                        tabIndex={active ? undefined : -1}
                        className="interactive-surface inline-flex items-center gap-2 rounded-md bg-white px-6 py-3.5 text-[0.9375rem] font-bold text-[color:var(--mcgm-ground-deep)] shadow-lg transition-transform hover:scale-[1.02] hover:bg-white/90"
                      >
                        {slide.action}
                        <ArrowRight className="h-4 w-4" aria-hidden />
                      </a>
                      <a
                        href="#coverage"
                        tabIndex={active ? undefined : -1}
                        className="interactive-surface inline-flex items-center gap-2 rounded-md px-5 py-3.5 text-[0.9375rem] font-semibold text-white ring-1 ring-white/50 hover:bg-white/10"
                      >
                        {t('See what we cover')}
                      </a>
                    </div>
                  </div>

                  {/* Published figures, in large type on glass. Every value is
                      read from the corporation record, which carries its source. */}
                  <div className="hidden grid-cols-2 gap-3 lg:grid">
                    {heroFacts.map((fact, index) => (
                      <div
                        key={fact.label}
                        className={cn(
                          'rounded-xl bg-white/10 p-4 ring-1 ring-white/20 backdrop-blur-md',
                          // An odd count would leave a hole in the two-column
                          // grid; the lead figure takes the full row instead.
                          heroFacts.length % 2 === 1 && index === 0 && 'col-span-2',
                        )}
                      >
                        <p className="numeric text-[1.75rem] leading-none font-extrabold text-white">{fact.value}</p>
                        <p className="mt-1.5 text-[0.75rem] leading-snug font-semibold text-white/90">{fact.label}</p>
                        <p className="mt-0.5 text-[0.625rem] text-white/60">{fact.source}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* The slider's own controls, on the pale ground under the band so
            they never sit over the artwork. A dot per slide, plus the
            corporation strip and the officer's door - neither of which the
            reference band has an equivalent for, and neither of which this
            page can do without. */}
        <div className="border-b border-ink-200 bg-surface">
          <div className="mx-auto flex max-w-[80rem] flex-col gap-5 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2" role="tablist" aria-label={t('Platform highlights')}>
                {BANNER_SLIDES.map((slide, index) => (
                  <button
                    key={slide.heading}
                    type="button"
                    role="tab"
                    aria-selected={index === bannerSlide}
                    aria-label={t('Show highlight {0}', formatNumber(index + 1))}
                    onClick={() => {
                      setBannerSlide(index)
                      setBannerPaused(true)
                    }}
                    className="mcgm-dot relative h-2 w-2 rounded-full before:absolute before:-inset-2.5 before:content-['']"
                    data-active={index === bannerSlide}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => setBannerPaused((paused) => !paused)}
                aria-pressed={bannerPaused}
                className="interactive-surface rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                title={bannerPaused ? t('Resume the banner') : t('Pause the banner')}
                aria-label={bannerPaused ? t('Resume the banner') : t('Pause the banner')}
              >
                {bannerPaused ? (
                  <Play className="h-3.5 w-3.5" aria-hidden />
                ) : (
                  <Pause className="h-3.5 w-3.5" aria-hidden />
                )}
              </button>
            </div>

            {/* The active corporation's own figures. Deliberately labelled
                with literal terms ("Administrative wards", "Zones")
                rather than `terminology.primaryUnitPlural`: the composed term reaches
                `t()` through a template literal, which the catalogue
                extractor cannot see, and the entry that renders here would be
                reported as orphaned and pruned. */}
            <dl className="flex flex-wrap items-center gap-x-6 gap-y-2">
              {[
                { label: t('Administrative wards'), value: formatNumber(municipality.administrativeUnits.wards) },
                { label: t('Corporator seats'), value: corporation.electoralWards ? formatNumber(corporation.electoralWards) : '—' },
                { label: t('Zones'), value: formatNumber(municipality.administrativeUnits.zones) },
                { label: t('Area'), value: t('{0} km²', formatNumber(corporation.areaSqKm, 0)) },
                {
                  label: t('Established'),
                  value: corporation.establishedYear ? String(corporation.establishedYear) : '—',
                },
              ].map((stat) => (
                <div key={stat.label} className="flex items-baseline gap-1.5">
                  <dd className="numeric text-[0.9375rem] font-bold text-ink-900">{stat.value}</dd>
                  <dt className="text-[0.6875rem] tracking-[0.06em] text-ink-500 uppercase">{stat.label}</dt>
                </div>
              ))}
            </dl>

            {/* The way into the console. It used to read "Officer sign-in" and
                point at the sign-in screen, which sat after this page; sign-in
                now comes first, so by the time this is on screen the principal
                is established and the door leads inward.

                Kept as a real control rather than relying on the click-anywhere
                behaviour on the page root: that is a convenience for a mouse,
                and it is unreachable by keyboard or screen reader. This is the
                affordance that actually names the action. */}
            <a
              href="/"
              className="interactive-surface inline-flex w-fit items-center gap-2 rounded-md bg-govt-700 px-4 py-2.5 text-[0.8125rem] font-semibold text-white hover:bg-govt-800"
            >
              <LogIn className="h-4 w-4" aria-hidden />
              {t('Enter the console')}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </a>
          </div>
        </div>

        {/* ============================================================ */}
        {/* What we cover - real photographs of Mumbai                   */}
        {/* ============================================================ */}
        <section id="coverage" className="border-b border-ink-200 bg-surface-sunken">
          <div className="mx-auto max-w-[80rem] px-4 py-12 lg:py-16">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl">
                <p className="text-[0.6875rem] font-bold tracking-[0.14em] text-govt-600 uppercase">{t('What we cover')}</p>
                <h2 className="mt-2 text-[2rem] leading-tight font-extrabold tracking-[-0.02em] text-ink-900">
                  {t('Every service the city runs, on one intelligence platform')}
                </h2>
                <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-600">
                  {t('From the island city to the eastern and western suburbs - each area below opens its own live intelligence, built on Mumbai’s published facts and clearly labelled demonstration data.')}
                </p>
              </div>
              <dl className="flex gap-6">
                {[
                  { value: formatNumber(coverageCards.length), label: t('areas') },
                  { value: '120+', label: t('intelligence modules') },
                  { value: '2', label: t('languages') },
                ].map((stat) => (
                  <div key={stat.label}>
                    <dd className="numeric text-[1.75rem] leading-none font-extrabold text-govt-700">{stat.value}</dd>
                    <dt className="mt-1 text-[0.6875rem] font-semibold tracking-wide text-ink-500 uppercase">{stat.label}</dt>
                  </div>
                ))}
              </dl>
            </div>

            <ul className="mt-9 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {coverageCards.map((card) => (
                <li key={card.title}>
                  <figure className="group flex h-full flex-col overflow-hidden rounded-xl bg-surface shadow-sm ring-1 ring-ink-200 transition-shadow hover:shadow-lg">
                    <div className="relative h-44 overflow-hidden">
                      <img
                        src={card.photo.src}
                        alt={card.photo.caption}
                        loading="lazy"
                        decoding="async"
                        style={{ objectPosition: card.photo.focus }}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                      <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-[#0b1636]/85 via-[#0b1636]/20 to-transparent" />
                      <h3 className="absolute right-3 bottom-2.5 left-3 text-[1.0625rem] leading-tight font-bold text-white drop-shadow">
                        {card.title}
                      </h3>
                    </div>
                    <figcaption className="flex flex-1 flex-col gap-2 p-3.5">
                      <p className="text-[0.8125rem] leading-snug text-ink-700">{card.line}</p>
                      <p className="text-[0.625rem] text-ink-400 italic">{t('Photo: {0}', card.photo.caption)}</p>
                      <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
                        {card.links.map((link) => (
                          <a
                            key={link.to}
                            href={signInFor(link.to, isAuthenticated)}
                            className="interactive-surface inline-flex items-center gap-1 rounded-full bg-govt-50 px-2.5 py-1 text-[0.6875rem] font-semibold text-govt-700 ring-1 ring-govt-200 hover:bg-govt-100"
                          >
                            {link.label}
                            <ArrowRight className="h-3 w-3" aria-hidden />
                          </a>
                        ))}
                      </div>
                    </figcaption>
                  </figure>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* The banner's first slide scrolls here. A dark band over the Sewri
            flamingos, so the page alternates light and dark the way the hero
            sets it. */}
        <section id="surfaces" className="relative isolate overflow-hidden bg-[#0b1636]">
          <PhotoBackdrop photo={photos.flamingos} />
          <div className="mx-auto max-w-[80rem] px-4 py-14 lg:py-20">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl">
                <p className="text-[0.6875rem] font-bold tracking-[0.14em] text-google-blue-300 uppercase">{t('The platform')}</p>
                <h2 className="mt-2 text-[clamp(1.75rem,3vw,2.5rem)] leading-tight font-extrabold tracking-[-0.02em] text-white">
                  {t('The intelligence surfaces behind this portal')}
                </h2>
                <p className="mt-3 text-[0.9375rem] leading-relaxed text-white/80">
                  {t('What this page shows is the front of it. Behind sign-in the same figures are assembled into the surfaces an officer actually decides from — one for each domain the corporation operates.')}
                </p>
              </div>
              <PhotoCaption caption={photos.flamingos.caption} />
            </div>

            <ul className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {SURFACES.map((surface, index) => (
                <li key={surface.label}>
                  <a
                    href={signInFor(surface.to, isAuthenticated)}
                    className="interactive-surface group flex h-full flex-col gap-3 rounded-xl bg-white/10 p-5 ring-1 ring-white/15 backdrop-blur-md transition-all hover:-translate-y-0.5 hover:bg-white/15 hover:ring-white/30"
                  >
                    <span
                      className={cn(
                        'flex h-11 w-11 items-center justify-center rounded-xl shadow-lg',
                        COLUMN_HUES[index % COLUMN_HUES.length],
                      )}
                      aria-hidden
                    >
                      <surface.icon className="h-5 w-5" />
                    </span>
                    <span className="text-[0.9375rem] leading-tight font-bold text-white">{surface.label}</span>
                    <span className="text-[0.75rem] leading-relaxed text-white/70">{surface.note}</span>
                    <span className="mt-auto inline-flex items-center gap-1 pt-1 text-[0.6875rem] font-semibold text-google-blue-300 group-hover:text-white">
                      {t('Open')}
                      <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ============================================================ */}
        {/* Assurance - what this platform is answerable for             */}
        {/* ============================================================ */}
        <section className="border-b border-ink-200 bg-surface-sunken">
          <div className="mx-auto grid max-w-[80rem] grid-cols-1 gap-8 px-4 py-14 lg:grid-cols-[5fr_7fr] lg:py-20">
            {/* The heading set over the corporation's own head office - a
                building that has housed the city's administration since 1893
                carries the idea of the band, a record that outlasts whoever
                wrote it. */}
            <figure className="relative isolate flex min-h-[22rem] flex-col justify-end overflow-hidden rounded-2xl p-7 shadow-xl">
              <img
                src={photos.bmcHeadOffice.src}
                alt={photos.bmcHeadOffice.caption}
                loading="lazy"
                decoding="async"
                style={{ objectPosition: photos.bmcHeadOffice.focus }}
                className="absolute inset-0 -z-10 h-full w-full object-cover"
              />
              <span aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-[#0b1636] via-[#0b1636]/70 to-[#0b1636]/10" />
              <p className="text-[0.6875rem] font-bold tracking-[0.14em] text-gold-300 uppercase">{t('Assurance')}</p>
              <h2 className="mt-2 text-[clamp(1.75rem,3vw,2.5rem)] leading-tight font-extrabold tracking-[-0.02em] text-white">
                {t('Built to be answerable')}
              </h2>
              <p className="mt-3 text-[0.9375rem] leading-relaxed text-white/85">
                {t('A decision an officer cannot account for is worse than no decision. Four properties hold across every surface behind this portal, and each of them is inspectable from inside the platform.')}
              </p>
              <figcaption className="mt-5">
                <PhotoCaption caption={photos.bmcHeadOffice.caption} />
              </figcaption>
            </figure>

            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {ASSURANCES.map((item, index) => (
                <li
                  key={item.label}
                  className="group relative flex flex-col overflow-hidden rounded-2xl bg-surface p-6 shadow-card ring-1 ring-ink-200 transition-shadow hover:shadow-lg"
                >
                  <span aria-hidden className={cn('absolute inset-x-0 top-0 h-1', ASSURANCE_BARS[index % ASSURANCE_BARS.length])} />
                  <span
                    aria-hidden
                    className={cn(
                      'numeric flex h-12 w-12 items-center justify-center rounded-xl text-[1.125rem] font-extrabold shadow-md',
                      COLUMN_HUES[index % COLUMN_HUES.length],
                    )}
                  >
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <p className="mt-4 text-[1.0625rem] leading-snug font-bold text-ink-900">{item.label}</p>
                  <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-600">{item.note}</p>
                  <a
                    href={signInFor(item.to, isAuthenticated)}
                    className="mt-auto inline-flex items-center gap-1 pt-4 text-[0.75rem] font-semibold text-govt-700 hover:underline"
                  >
                    {item.linkLabel}
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ============================================================ */}
        {/* Notices and updates                                          */}
        {/* ============================================================ */}
        {/* Built to the reference portal's own arrangement, which is
            deliberately ASYMMETRIC: a narrow column of two illustrated cards
            beside a wider tabbed board, on its 5/7 split rather than a half.
            The other two link sections share one uniform tile; this one does
            not, because the asymmetry is the section's shape and flattening it
            produced a better page that was no longer the reference's. */}
        <section className="border-b border-ink-200 bg-surface">
          <div className="mx-auto max-w-[80rem] px-4 py-12 lg:py-14">
            <p className="text-center text-[0.6875rem] font-bold tracking-[0.14em] text-govt-600 uppercase">{t('This week')}</p>
            <h2 className="mt-2 text-center text-[clamp(1.75rem,3vw,2.5rem)] leading-tight font-extrabold tracking-[-0.02em] text-ink-900">
              {t('Notices and updates')}
            </h2>
            <span aria-hidden className="mcgm-heading-rule mx-auto mt-3 block h-[3px] w-14 rounded-full" />

            <div className="mt-9 grid grid-cols-1 gap-6 lg:grid-cols-[5fr_7fr]">
              {/* ---- The two illustrated cards ----------------------- */}
              <ul className="flex flex-col gap-4">
                {NOTICE_FEATURES.map((feature, index) => (
                  <li
                    key={feature.title}
                    className={cn(
                      'group flex flex-1 flex-col overflow-hidden rounded-xl border border-ink-200 border-b-4 shadow-card transition-shadow hover:shadow-lg',
                      NOTICE_ACCENT[index % NOTICE_ACCENT.length],
                      CARD_WASH[index % CARD_WASH.length],
                    )}
                  >
                    <div className="relative h-32 overflow-hidden">
                      <img
                        src={feature.photo.src}
                        alt={feature.photo.caption}
                        loading="lazy"
                        decoding="async"
                        style={{ objectPosition: feature.photo.focus }}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                      <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-[#0b1636]/90 via-[#0b1636]/25 to-transparent" />
                      <p className="absolute right-4 bottom-3 left-4 text-[1.0625rem] leading-snug font-bold text-white drop-shadow">
                        {feature.title}
                      </p>
                    </div>
                    <div className="flex flex-1 flex-col p-4">
                      <p className="text-[0.8125rem] leading-relaxed text-ink-600">{feature.blurb}</p>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <p className="text-[0.625rem] text-ink-400 italic">{t('Photo: {0}', feature.photo.caption)}</p>
                        <a
                          href={signInFor(feature.to, isAuthenticated)}
                          className="flex shrink-0 items-center gap-1 text-[0.75rem] font-semibold text-google-blue-700 hover:underline"
                        >
                          {t('Read more')}
                          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                        </a>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              {/* ---- The tabbed board -------------------------------- */}
              <div className="rounded-xl border border-ink-200 bg-surface p-5 shadow-card">
                {/* Pills, filled rather than outlined: the reference fills its
                    inactive tabs too, and an outlined tab beside a filled one
                    reads as disabled rather than as unselected. */}
                <div role="tablist" aria-label={t('Notices and updates')} className="flex flex-wrap gap-2">
                  {NOTICE_TABS.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      id={`notice-tab-${tab.id}`}
                      aria-selected={noticeTab === tab.id}
                      aria-controls={`notice-panel-${tab.id}`}
                      onClick={() => setNoticeTab(tab.id)}
                      className={cn(
                        'rounded-md px-3.5 py-1.5 text-[0.75rem] font-semibold transition-colors',
                        noticeTab === tab.id
                          ? 'bg-google-blue-600 text-white'
                          : 'bg-google-blue-50 text-google-blue-800 hover:bg-google-blue-100',
                      )}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Every panel is rendered and all but one is `hidden`, rather
                    than mounting only the selected one. The reference unmounts;
                    this does not, because the browser's own in-page search then
                    finds a notice sitting behind a tab the reader has not
                    opened, which on a notice board is the point of publishing
                    it. Nothing about the difference is visible. */}
                {NOTICE_TABS.map((tab) => (
                  <ul
                    key={tab.id}
                    role="tabpanel"
                    id={`notice-panel-${tab.id}`}
                    aria-labelledby={`notice-tab-${tab.id}`}
                    hidden={noticeTab !== tab.id}
                    className="mt-4 divide-y divide-ink-100"
                  >
                    {tab.items.map((item) => (
                      <li key={item.label}>
                        <a
                          href={signInFor(item.to, isAuthenticated)}
                          className="group flex items-center gap-3.5 rounded-lg px-2 py-3.5 text-ink-700 transition-colors hover:bg-google-blue-50"
                        >
                          <span
                            aria-hidden
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-google-blue-50 text-google-blue-700 ring-1 ring-google-blue-100 group-hover:bg-google-blue-600 group-hover:text-white"
                          >
                            <item.icon className="h-[1.125rem] w-[1.125rem]" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[0.875rem] font-semibold text-ink-900 group-hover:text-google-blue-700">{item.label}</span>
                            <span className="mt-0.5 block text-[0.75rem] leading-snug text-ink-500">{item.note}</span>
                          </span>
                          {item.isNew ? (
                            <span className="shrink-0 rounded-sm bg-crit-500 px-1.5 py-0.5 text-[0.625rem] font-bold tracking-[0.08em] text-white uppercase">
                              {t('New')}
                            </span>
                          ) : null}
                        </a>
                      </li>
                    ))}
                  </ul>
                ))}

                <a
                  href={signInFor(ROUTES.intelligenceFeed, isAuthenticated)}
                  className="mt-4 inline-flex items-center gap-1.5 text-[0.75rem] font-semibold text-google-blue-700 hover:underline"
                >
                  {t('Know more')}
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* ============================================================ */}
        {/* Important links                                              */}
        {/* ============================================================ */}
        <section className="relative isolate overflow-hidden bg-[#0b1636]">
          <PhotoBackdrop photo={photos.marineDrive} />
          <div className="mx-auto max-w-[80rem] px-4 py-14 lg:py-20">
            <div className="flex flex-col items-center gap-3 text-center">
              <p className="text-[0.6875rem] font-bold tracking-[0.14em] text-gold-300 uppercase">{t('Every day')}</p>
              <h2 className="text-[clamp(1.75rem,3vw,2.5rem)] leading-tight font-extrabold tracking-[-0.02em] text-white">
                {t('Important links')}
              </h2>
              <span aria-hidden className="mcgm-heading-rule block h-[3px] w-14 rounded-full" />
              <PhotoCaption caption={photos.marineDrive.caption} />
            </div>

            <PortalLinkGrid tiles={QUICK_LINKS} isAuthenticated={isAuthenticated} />

            {/* ---- The handset row --------------------------------- */}
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="flex items-center gap-4 rounded-lg border border-ink-200 border-b-4 border-b-google-blue-600 bg-surface p-5 shadow-card">
                <span
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-google-blue-50 text-google-blue-700 ring-1 ring-google-blue-100 ring-inset"
                  aria-hidden
                >
                  <Smartphone className="h-6 w-6" />
                </span>
                <div className="min-w-0">
                  <p className="text-[0.9375rem] leading-snug font-bold text-ink-900">{t('Field application')}</p>
                  <p className="mt-1 text-[0.75rem] leading-relaxed text-ink-500">
                    {t('For the officer on site — inspection, verification of works, and closing a complaint where it was raised.')}
                  </p>
                  {/* Not links. The corporation publishes an application; this
                      demonstration cannot hand anyone a store listing, and a
                      badge that goes nowhere is worse than a badge that says
                      it is only telling you the application exists. */}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {[t('Google Play'), t('App Store')].map((store) => (
                      <span
                        key={store}
                        title={t('Published by the corporation on its own portal. It is not a surface of this demonstration.')}
                        className="cursor-help rounded border border-ink-200 bg-surface-sunken px-2 py-1 text-[0.6875rem] font-semibold text-ink-500"
                      >
                        {store}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4 rounded-lg border border-ink-200 border-b-4 border-b-intel-500 bg-surface p-5 shadow-card">
                <span
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-intel-50 text-intel-700 ring-1 ring-intel-100 ring-inset"
                  aria-hidden
                >
                  <MessageCircle className="h-6 w-6" />
                </span>
                <div className="min-w-0">
                  <p className="text-[0.9375rem] leading-snug font-bold text-ink-900">{t('Municipal Copilot')}</p>
                  <p className="mt-1 text-[0.75rem] leading-relaxed text-ink-500">
                    {t('Ask the platform in plain language. Every answer arrives with its evidence and the post permitted to act on it.')}
                  </p>
                  <a
                    href={signInFor(ROUTES.copilot, isAuthenticated)}
                    className="mt-2 inline-flex items-center gap-1 rounded-md bg-google-blue-600 px-3 py-1.5 text-[0.75rem] font-semibold text-white hover:bg-google-blue-700"
                  >
                    {t('Click here')}
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============================================================ */}
        {/* Mumbai in pictures - every photograph, credited               */}
        {/* ============================================================ */}
        {/* The CC BY-SA licences ask for the author and licence to be
            reachable by a visitor, so each photograph on the page is shown
            here once more with both, rather than only behind sign-in. */}
        <section className="relative isolate overflow-hidden bg-[#0b1636]">
          <div className="mx-auto max-w-[80rem] px-4 py-14 lg:py-20">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl">
                <p className="text-[0.6875rem] font-bold tracking-[0.14em] text-gold-300 uppercase">{t('The city we serve')}</p>
                <h2 className="mt-2 text-[clamp(1.75rem,3vw,2.5rem)] leading-tight font-extrabold tracking-[-0.02em] text-white">
                  {t('Mumbai in pictures')}
                </h2>
                <p className="mt-3 text-[0.9375rem] leading-relaxed text-white/75">
                  {t('Its sea front, its lakes, its railways and its people. Every photograph on this page is a real picture of Mumbai from Wikimedia Commons, credited to the person who took it.')}
                </p>
              </div>
              <a
                href="/cover/PHOTO-CREDITS.txt"
                target="_blank"
                rel="noreferrer noopener"
                className="interactive-surface inline-flex w-fit items-center gap-2 rounded-md px-4 py-2.5 text-[0.8125rem] font-semibold text-white ring-1 ring-white/40 hover:bg-white/10"
              >
                {t('Full photo credits and licences')}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </a>
            </div>

            <ul className="mt-10 grid grid-flow-row-dense auto-rows-[11rem] grid-cols-2 gap-3 md:grid-cols-4 lg:auto-rows-[13rem]">
              {gallery.map((item, index) => (
                <li
                  key={item.src}
                  className={cn(
                    'group relative overflow-hidden rounded-xl ring-1 ring-white/10',
                    // One large tile and two wide ones, so the wall reads as a
                    // mosaic rather than a contact sheet. With fourteen pictures
                    // these fill exactly eighteen cells at two columns and
                    // twenty at four.
                    index === 0 && 'col-span-2 row-span-2',
                    index === 7 && 'md:col-span-2',
                    index === 11 && 'col-span-2',
                    index === 13 && 'md:col-span-2',
                  )}
                >
                  <figure className="h-full">
                    <img
                      src={item.src}
                      alt={item.caption}
                      loading="lazy"
                      decoding="async"
                      style={{ objectPosition: item.focus }}
                      className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                    <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
                    <figcaption className="absolute inset-x-0 bottom-0 p-3">
                      <p className="text-[0.75rem] leading-snug font-semibold text-white">{item.caption}</p>
                      <p className="mt-0.5 text-[0.625rem] text-white/65">
                        {item.author} · {item.licence}
                      </p>
                    </figcaption>
                  </figure>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      {/* ============================================================ */}
      {/* Feedback tab - the vertical tab every portal in this state    */}
      {/* carries on the right edge                                     */}
      {/* ============================================================ */}
      <a
        href={signInFor(ROUTES.citizenServices, isAuthenticated)}
        className="fixed top-1/2 right-0 z-30 hidden -translate-y-1/2 rounded-l-md bg-google-blue-600 px-2 py-5 text-[0.75rem] font-bold tracking-wide text-white shadow-drawer [writing-mode:vertical-rl] hover:bg-google-blue-700 lg:block"
      >
        {t('Feedback')}
      </a>

      {/* ============================================================ */}
      {/* Footer                                                       */}
      {/* ============================================================ */}
      <footer className="border-t-[3px] border-gold-500 bg-gradient-to-br from-navy-950 via-navy-900 to-navy-950">
        <div className="mx-auto max-w-[80rem] px-4 py-10">
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {/* ---- Find the office ------------------------------- */}
            <div>
              <p className="flex items-center gap-2 text-[0.9375rem] font-bold text-white">
                <MapPin className="h-4 w-4 text-gold-300" aria-hidden />
                {t('Finding the office')}
              </p>
              <p className="mt-3 text-[0.75rem] leading-relaxed text-white/75">{corporation.headquarters}</p>
              <p className="mt-2 text-[0.75rem] leading-relaxed text-white/75">
                {t('For an emergency, dial 112, India’s national emergency number. Civic complaints are lodged through the corporation’s own online services and its ward offices; this demonstration does not connect to either.')}
              </p>
              <a
                href={`tel:112`}
                className="mt-3 inline-flex items-center gap-2 rounded-md bg-crit-50 px-2.5 py-1.5 text-[0.8125rem] font-semibold text-crit-700 ring-1 ring-crit-200 ring-inset"
              >
                <Phone className="h-4 w-4" aria-hidden />
                {t('Emergency 112')}
              </a>
            </div>

            {/* ---- Contact --------------------------------------- */}
            <div>
              <p className="flex items-center gap-2 text-[0.9375rem] font-bold text-white">
                <MessageCircle className="h-4 w-4 text-gold-300" aria-hidden />
                {t('Contact')}
              </p>
              <p className="mt-3 text-[0.75rem] leading-relaxed text-white/75">
                {t('Where an officer goes when the platform is the problem rather than the city.')}
              </p>
              <ul className="mt-3 flex flex-col gap-1.5 text-[0.75rem] text-white/75">
                {[
                  { icon: MessageCircle, label: t('Platform service desk') },
                  { icon: AtSign, label: t('Requesting access for a post') },
                  { icon: Share2, label: t('Owners of each data source') },
                  { icon: Rss, label: t('Release notes and changes') },
                ].map((row) => (
                  <li key={row.label} className="flex items-center gap-2">
                    <row.icon className="h-3.5 w-3.5 shrink-0 text-white/55" aria-hidden />
                    {row.label}
                  </li>
                ))}
              </ul>
            </div>

            {/* ---- Information ----------------------------------- */}
            <div>
              <p className="flex items-center gap-2 text-[0.9375rem] font-bold text-white">
                <Info className="h-4 w-4 text-gold-300" aria-hidden />
                {t('Information')}
              </p>
              <dl className="mt-3 flex flex-col gap-1.5 text-[0.75rem] text-white/75">
                {[
                  { label: t('Last reviewed and updated'), value: formatDate(DEMO_NOW) },
                  { label: t('Visitors today'), value: formatNumber(counters.today) },
                  { label: t('Total visitors'), value: formatNumber(counters.total) },
                ].map((row) => (
                  <div key={row.label} className="flex items-baseline justify-between gap-3">
                    <dt>{row.label}</dt>
                    <dd className="numeric font-semibold text-white">{row.value}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {['GIGW', 'W3C', 'WCAG 2.1'].map((mark) => (
                  <span
                    key={mark}
                    className="rounded border border-white/15 bg-white/10 px-1.5 py-0.5 text-[0.625rem] font-semibold text-white/70"
                  >
                    {mark}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <ul className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-white/15 pt-4 text-[0.75rem] text-white/75">
            {[
              t('Privacy policy'),
              t('Disclaimer'),
              t('Contact us'),
              t('Accessibility statement'),
              t('Site map'),
            ].map((label) => (
              <li key={label} className="border-l border-white/25 pl-3 first:border-l-0 first:pl-0">
                {label}
              </li>
            ))}
          </ul>

          {/* What this page is. Stated in the footer, where a government
              portal states its ownership, because a portal facade that does
              not say so is the one thing on this page that could mislead. */}
          <p className="mt-4 border-t border-white/15 pt-3 text-[0.6875rem] leading-relaxed text-white/55">
            {t('This is a demonstration of the {0} platform, rendered for {1}. It is not the corporation’s live portal, no municipal system is contacted, and no transaction on this page is real.', municipality.branding.productFamily, corporationName(corporation))}
          </p>
          {/* The photographs are civic imagery. Said here as well as in the
              photo credits file,
              because a building on a government page is read as a claim about
              whose page it is. The CC BY-SA licences require the author and
              licence to be reachable by a visitor, so the short credit sits on
              the page itself, not only behind sign-in. */}
          <p className="text-[0.6875rem] leading-relaxed text-white/55">
            {t('The photographs on this page are pictures of Mumbai from Wikimedia Commons, each captioned with what it shows and credited to its author and licence in “Mumbai in pictures” above. They are civic imagery and do not imply endorsement by {0}. Full credits and source links are in the photo credits file.', corporationName(corporation))}
          </p>
        </div>
      </footer>
    </div>
  )
}

export default PortalLandingPage
