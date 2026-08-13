import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CloudRain,
  Droplets,
  FileText,
  Flame,
  Gauge,
  GraduationCap,
  HeartPulse,
  IndianRupee,
  Info,
  Landmark,
  Leaf,
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
  type LucideIcon,
} from 'lucide-react'
import { corporationName } from '@/config/corporations'
import { municipality } from '@/config/municipality.config'
import { NAV_SECTIONS, ROUTES } from '@/config/navigation'
import { useActiveCorporation } from '@/stores/corporation.store'
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
 * controls, the masthead, the tab bar, the notice board, the link tiles, the
 * three-column footer with its compliance marks - because that is the shape a
 * Maharashtra government officer already knows how to read.
 *
 * IT IS READ BY OFFICERS, NOT BY CITIZENS. That is the one thing to hold on to
 * when editing anything here, because every instinct the chrome invites is the
 * wrong one. A citizen portal puts "pay property tax" on a tile, because paying
 * it is the errand. An officer never pays it: they are asked at ten in the
 * morning why collection is behind in three wards, so the tile is the screen
 * that answers that. Likewise the navigation is segmented by DECISION SURFACE
 * rather than by audience, the notice board carries circulars and escalations
 * rather than civic announcements, and the update line reports what is waiting
 * on an approval rather than what the control room is advising.
 *
 * The bands, in order:
 *
 *   hero            what this is, and the door to sign in
 *   use cases       the decisions it is built to carry          [photographic]
 *   surfaces        what an officer works from behind sign-in
 *   assurance       why any of it should be believed
 *   notices         circulars, escalations and what has changed
 *   links           the screens an officer opens daily
 *   related         the departmental surfaces, four to a page
 *   footer          the office, the service desk, the marks
 *
 * Three things about this page are deliberate and worth stating.
 *
 * It is DEPLOYMENT-NEUTRAL. Every name, figure, address and statistic is read
 * from the ACTIVE corporation, so this is Pune's portal when Pune is selected
 * and Jalna's when Jalna is - the same way every other surface in the platform
 * behaves. The masthead therefore leads with the PLATFORM and names the
 * corporation one line down as the deployment, rather than the reverse.
 *
 * SIGN-IN IS A DESTINATION, NOT A PANEL. The door leads to `/login`, where the
 * position, the passphrase and the audit notice belong together. Nothing on
 * this page transacts.
 *
 * It is NOT a claim to be the corporation's live portal, and must never be
 * allowed to read as one. The environment badge sits in the utility strip, the
 * footer states what this is, and the photographs are captioned as state
 * institutions so that a civic building is never read as a claim about whose
 * page this is.
 *
 * Every entry in the navigation and in the tiles below is a surface this
 * platform actually implements, so the page never offers a destination it
 * cannot reach. A visitor who signs in should recognise the command rail as
 * the same structure they have just been browsing.
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
 * Where a portal destination actually takes the visitor: the officer sign-in
 * screen, carrying where they were headed.
 *
 * This page is only ever rendered to someone who is NOT signed in - an
 * authenticated principal is redirected to their own landing route the moment
 * this component runs. Every module named on it therefore sits behind
 * `RequireAuth`, and following one directly bounced the visitor straight back
 * here: they clicked "Ward Intelligence" and arrived at the portal front page
 * again, with nothing said about why. A front door that answers every knock by
 * closing is not a front door.
 *
 * So every destination into the platform resolves to `/login/direct` instead.
 * The card, column and button still READ as the module they name - that is what
 * the visitor came looking for - and now they land somewhere that can take them
 * there. `?next=` carries the intent across the sign-in so the click is not
 * thrown away; `LoginPage` re-checks it against the permission engine before
 * honouring it, so naming a route here can never grant one.
 *
 * Not applied to the page's own controls - the mega-menu toggle, the ticker
 * pause, the font-size steps, the carousel, the language switcher. Those are
 * how the visitor reads this page rather than ways off it, and sending them to
 * sign-in would leave the portal unusable.
 */
/**
 * Where a portal tile or menu link actually goes.
 *
 * This used to mint `/login/direct?next=…`, because the portal was public and
 * every destination had to bounce an anonymous visitor through sign-in. The
 * portal now sits behind the session, so the principal is already established
 * by the time any of these links is on screen and the destination is reached
 * directly. The permission engine still governs what opens: `RequirePermission`
 * re-evaluates on arrival, so a link to a module this role may not read is
 * refused there exactly as it was before.
 */
function signInFor(to: string): string {
  return to
}

interface PortalMenu {
  id: string
  label: string
  /**
   * Columns of the drop panel. `heading` is optional: a menu derived from a
   * single navigation section has nothing to say above its own links that the
   * tab has not already said, and repeating the tab's label inside its own
   * panel reads as a stutter.
   */
  groups: Array<{ heading?: string; links: PortalLink[] }>
}

function build$PORTAL_MENUS(): PortalMenu[] {
  // The portal's menu IS the platform's navigation, derived from it rather
  // than restated beside it.
  //
  // It used to be eight hand-written tabs that collapsed the platform's
  // sixteen sections — so the front page advertised a structure the console
  // behind it did not have, and every route added to the rail was missing here
  // until someone remembered to add it twice. Reading `NAV_SECTIONS` means the
  // two cannot drift: a section added to the navigation appears on the portal
  // the same day, under the same name, pointing at the same route.
  //
  // Every label and description here is already a translated `t()` string in
  // the navigation config, so deriving them introduces no new message the
  // catalogue has to carry.
  return NAV_SECTIONS.map((section) => {
    const links: PortalLink[] = section.items.map((item) => ({
      label: item.label,
      to: item.to,
      note: item.description,
    }))

    // Spread across up to three columns so the drop panel uses the grid it
    // already lays out, instead of running one long column down the page.
    // Sections carrying four or fewer destinations stay in a single column.
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
  // What an OFFICER opens, not what a citizen transacts. A citizen portal puts
  // "pay property tax" here because paying it is the errand. An officer never
  // pays it - they are asked at ten in the morning why collection is behind in
  // three wards, and the tile has to be the screen that answers that.
  return [
    { icon: Gauge, label: t('Executive Overview'), note: t('The whole city, ordered by what needs deciding today.'), to: ROUTES.executive },
    { icon: Radar, label: t('Situation Room'), note: t('Live incidents and the control-room picture as it stands.'), to: ROUTES.situationRoom },
    { icon: Megaphone, label: t('Alerts & Escalations'), note: t('What has passed its standard, and who is holding it.'), to: ROUTES.alerts },
    { icon: FileText, label: t('Decision Centre'), note: t('Decisions awaiting approval, with the evidence attached.'), to: ROUTES.decisions },
    { icon: MapPin, label: t('Ward Intelligence'), note: t('Every ward scored on service, equity and delivery.'), to: ROUTES.wards },
    { icon: IndianRupee, label: t('Revenue Intelligence'), note: t('Demand, collection and arrears against the register.'), to: ROUTES.revenue },
    { icon: Droplets, label: t('Water Intelligence'), note: t('Supply, pressure, non-revenue water and treatment load.'), to: ROUTES.water },
    { icon: Trash2, label: t('Solid Waste Intelligence'), note: t('Collection routes, lifting, processing and disposal.'), to: ROUTES.waste },
    { icon: Route, label: t('Roads Intelligence'), note: t('Surface condition, works in progress and defect liability.'), to: ROUTES.roads },
    { icon: CloudRain, label: t('Monsoon Intelligence'), note: t('Rainfall, desilting progress and where the water will stand.'), to: ROUTES.monsoon },
    { icon: Building2, label: t('Project Delivery'), note: t('Sanctioned works, and physical against financial progress.'), to: ROUTES.projects },
    { icon: Scale, label: t('Trust Centre'), note: t('Where every figure came from, and which of them are modelled.'), to: ROUTES.trustCentre },
  ]
}
let QUICK_LINKS: PortalTile[] = build$QUICK_LINKS()

/* ==========================================================================
   The bands below the fold
   --------------------------------------------------------------------------
   Everything a visitor is told between the sign-in and the helpline. Three
   bands, each answering one question a first-time visitor actually has: what
   is behind this, how far does it reach, and why should any of it be
   believed.

   Both lists are built rather than declared, for the same reason the service
   catalogue above is: they name the corporation's own unit terminology, and a
   module-scoped constant would freeze that to whichever corporation and
   whichever language happened to be loaded first.
   ========================================================================== */

interface PortalSurface {
  icon: LucideIcon
  label: string
  note: string
  to: string
}

function build$SURFACES(): PortalSurface[] {
  const unit = municipality.terminology.primaryUnitPlural
  return [
    {
      icon: Gauge,
      label: t('Commissioner’s cockpit'),
      note: t('The whole city on one screen, ordered by what needs a decision today.'),
      to: ROUTES.cockpit,
    },
    {
      icon: Radar,
      label: t('Situation room'),
      note: t('Live incidents, escalations and the control-room picture as it stands.'),
      to: ROUTES.situationRoom,
    },
    {
      icon: MapPin,
      label: t('{0} intelligence', municipality.terminology.primaryUnitSingular),
      note: t('Every one of the {0} scored on service, equity and delivery.', unit),
      to: ROUTES.wards,
    },
    {
      icon: IndianRupee,
      label: t('Revenue and property tax'),
      note: t('Demand, collection, arrears and the recovery worklist behind them.'),
      to: ROUTES.property,
    },
    {
      icon: Droplets,
      label: t('Water and sewerage'),
      note: t('Supply, pressure, non-revenue water and treatment load.'),
      to: ROUTES.water,
    },
    {
      icon: Trash2,
      label: t('Solid waste'),
      note: t('Collection routes, lifting, processing and the load on disposal.'),
      to: ROUTES.waste,
    },
    {
      icon: CloudRain,
      label: t('Monsoon and storm water'),
      note: t('Rainfall, desilting progress and where the water will stand.'),
      to: ROUTES.monsoon,
    },
    {
      icon: Siren,
      label: t('Disaster and emergency'),
      note: t('Preparedness, response and the city’s standing resilience picture.'),
      to: ROUTES.disaster,
    },
  ]
}
let SURFACES: PortalSurface[] = build$SURFACES()

/* ==========================================================================
   The banner
   ========================================================================== */

interface BannerPhoto {
  src: string
  /** Passed straight to `object-position`. */
  focus: string
}

/* The three usable civic photographs, with the crop each one needs. Everything
   else on disk is a 144px thumbnail, which the 13rem frame would render soft. */
const BANNER_PHOTOS = {
  secretariat: { src: '/civic/secretariat.jpg', focus: '50% 45%' },
  legislature: { src: '/civic/legislature.jpg', focus: '38% 55%' },
  assembly: { src: '/civic/assembly.jpg', focus: '50% 42%' },
} satisfies Record<string, BannerPhoto>

interface BannerSlide {
  heading: string
  features: string[]
  action: string
  to: string
  /**
   * Two civic photographs, cut into the circular frames of the collage.
   *
   * Each carries its own focal point, because a circular crop of a building
   * photographed from the ground centres on sky and roadway if left alone -
   * `object-position` is what puts the façade in the frame instead.
   */
  photos: [BannerPhoto, BannerPhoto]
}

function build$BANNER_SLIDES(): BannerSlide[] {
  const unit = municipality.terminology.primaryUnitSingular
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
    },
    {
      heading: t('The city on one screen, ordered by what needs deciding'),
      features: [
        t('Live incidents, escalations and the control-room picture'),
        t('Each {0} scored on service, equity and delivery', unit),
        t('Cross-domain correlation, so a cause is read once'),
        t('Standing resilience picture ahead of the incident'),
      ],
      action: t('Open the commissioner’s cockpit'),
      to: ROUTES.cockpit,
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
    },
    // A different pair on each slide, rather than the same two mapped onto all
    // three. A band that rotates three times and shows the same photographs
    // each time reads as broken rather than as rotating.
  ].map((slide, index) => ({
    ...slide,
    photos: [
      [BANNER_PHOTOS.secretariat, BANNER_PHOTOS.legislature],
      [BANNER_PHOTOS.assembly, BANNER_PHOTOS.secretariat],
      [BANNER_PHOTOS.legislature, BANNER_PHOTOS.assembly],
    ][index] as [BannerPhoto, BannerPhoto],
  }))
}
let BANNER_SLIDES: BannerSlide[] = build$BANNER_SLIDES()

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
      note: t('The platform contacts nothing over a network — not a model, not a map tile, not a font. It runs entirely where the corporation runs it.'),
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

/* --------------------------------------------------------------------------
   One tile, three sections
   --------------------------------------------------------------------------
   Notices, important links and related links were three different shapes: a
   pair of feature cards beside a tab panel, a row of icon-and-label strips,
   and a carousel of centred cards on a coloured plinth. Three treatments for
   three lists of links is three things for a reader to learn.

   They are one shape now - the same tile the surfaces band already uses, in
   the same four-column grid. What differs between the sections is what sits
   ABOVE the grid: tabs on the notice board, arrows under the related links,
   nothing on the important ones. The tile itself never changes.
   -------------------------------------------------------------------------- */

interface PortalTile {
  icon: LucideIcon
  label: string
  note: string
  to: string
  /** Flags the notice as newly published. Only the notice board sets it. */
  isNew?: boolean
}

/**
 * The two feature cards that lead the notice board.
 *
 * The reference portal's notices section is ASYMMETRIC by design - a narrow
 * column of illustrated cards beside a wider tabbed board - and that asymmetry
 * is the whole of its shape. It was briefly folded into the uniform tile grid
 * the other two link sections use; this is the reference's own arrangement,
 * restored deliberately.
 */
interface NoticeFeature {
  /** A civic photograph, square-cropped into the card's thumbnail. */
  photo: BannerPhoto
  title: string
  blurb: string
  to: string
}

function build$NOTICE_FEATURES(): NoticeFeature[] {
  return [
    {
      photo: BANNER_PHOTOS.secretariat,
      title: t('How access is granted'),
      blurb: t('Sign-in is by the post held, not by the person. The post carries the authority and the data scope, and the officer is named against every action taken under it.'),
      to: ROUTES.accessGovernance,
    },
    {
      photo: BANNER_PHOTOS.legislature,
      title: t('Where every figure comes from'),
      blurb: t('Each surface states the source of its numbers and which of them are modelled. An officer who cannot cite a figure in a meeting cannot use it.'),
      to: ROUTES.trustCentre,
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
        {
          icon: MapPin,
          label: t('{0} equity and allocation', unit),
          note: t('Allocation read against need rather than against last year.'),
          to: ROUTES.wardEquity,
          isNew: true,
        },
        {
          icon: MessageCircle,
          label: t('Copilot on procurement'),
          note: t('Contractor performance and tender history, asked in plain language.'),
          to: ROUTES.copilot,
          isNew: true,
        },
        {
          icon: Radar,
          label: t('Integration health'),
          note: t('Which departmental feed is stale, and since when.'),
          to: ROUTES.integrations,
          isNew: true,
        },
        {
          icon: CloudRain,
          label: t('Monsoon scenario workspace'),
          note: t('What the city looks like under a heavier spell than last year.'),
          to: ROUTES.scenarios,
          isNew: true,
        },
      ],
    },
    {
      id: 'circulars',
      label: t('Circulars'),
      items: [
        {
          icon: FileText,
          label: t('Standing orders and circulars'),
          note: t('The orders in force, and the ones each of them supersedes.'),
          to: ROUTES.institutionalMemory,
        },
        {
          icon: Landmark,
          label: t('Government resolutions'),
          note: t('State resolutions, and what each obliges the corporation to do.'),
          to: ROUTES.institutionalMemory,
        },
        {
          icon: Scale,
          label: t('Delegation of powers'),
          note: t('Which post may sanction what, and up to what value.'),
          to: ROUTES.accessGovernance,
        },
        {
          icon: Megaphone,
          label: t('Citizens’ charter standards'),
          note: t('The time each counter service must be delivered in.'),
          to: ROUTES.citizenServices,
        },
      ],
    },
    {
      id: 'escalations',
      label: t('Escalations'),
      items: [
        {
          icon: Gauge,
          label: t('Decisions awaiting approval'),
          note: t('Sitting with a post, with the evidence already assembled.'),
          to: ROUTES.decisions,
          isNew: true,
        },
        {
          icon: Siren,
          label: t('Alerts past their standard'),
          note: t('Beyond their window, and now with the department head.'),
          to: ROUTES.alerts,
        },
        {
          icon: Megaphone,
          label: t('Complaints breaching today'),
          note: t('Due to breach the charter before the day closes.'),
          to: ROUTES.citizenServices,
        },
        {
          icon: Building2,
          label: t('Works behind schedule'),
          note: t('Physical progress trailing the money already released.'),
          to: ROUTES.projects,
        },
      ],
    },
    {
      id: 'reference',
      label: t('Reference'),
      items: [
        {
          icon: Rss,
          label: t('Data sources'),
          note: t('Every feed, its owner, and when it last landed.'),
          to: ROUTES.dataSources,
        },
        {
          icon: Radar,
          label: t('Model registry'),
          note: t('What each model does, and how it scored on evaluation.'),
          to: ROUTES.modelRegistry,
        },
        {
          icon: Route,
          label: t('Lineage of a figure'),
          note: t('From the screen back to the record it was drawn from.'),
          to: ROUTES.lineage,
        },
        {
          icon: Scale,
          label: t('Access and roles'),
          note: t('The scope each position carries, and who granted it.'),
          to: ROUTES.accessGovernance,
        },
      ],
    },
  ]
}
let NOTICE_TABS: NoticeTab[] = build$NOTICE_TABS()

function build$RELATED_LINKS(): PortalTile[] {
  return [
    {
      icon: Building2,
      label: t('Building Permission'),
      note: t('Development control, permission and unauthorised construction.'),
      to: ROUTES.buildings,
    },
    {
      icon: Siren,
      label: t('Disaster Intelligence'),
      note: t('Preparedness, response and the standing resilience picture.'),
      to: ROUTES.disaster,
    },
    {
      icon: HeartPulse,
      label: t('Hospital Intelligence'),
      note: t('Facility load, critical care occupancy and referrals.'),
      to: ROUTES.hospitals,
    },
    {
      icon: GraduationCap,
      label: t('Education Intelligence'),
      note: t('Enrolment, attendance and school infrastructure.'),
      to: ROUTES.education,
    },
    {
      icon: Flame,
      label: t('Fire & Emergency'),
      note: t('Response times, appliance availability and fire safety.'),
      to: ROUTES.emergency,
    },
    {
      icon: Landmark,
      label: t('Workforce Intelligence'),
      note: t('Sanctioned posts, deployment and vacancy by department.'),
      to: ROUTES.workforce,
    },
    {
      icon: Scale,
      label: t('Council Resolutions'),
      note: t('Subjects tabled before the house, and how each was decided.'),
      to: ROUTES.councilResolutions,
    },
    {
      icon: Leaf,
      label: t('Environment Intelligence'),
      note: t('Air, noise, tree cover and the environment status report.'),
      to: ROUTES.environment,
    },
  ]
}
let RELATED_LINKS: PortalTile[] = build$RELATED_LINKS()

/**
 * The four Google brand hues, cycled across the columns.
 *
 * The grids run four across at `lg`, so index modulo four gives each COLUMN its
 * own hue rather than scattering colour through the rows - which is what makes
 * it read as an infographic rather than as decoration. Below `lg` the grid falls
 * to three columns and then two, and the sequence simply alternates; there is no
 * column left to encode.
 *
 * Written as whole class strings rather than composed from a hue name, because
 * Tailwind scans source text for class names and a template literal would name
 * classes it never generates.
 */
const COLUMN_HUES = [
  'bg-google-blue-600 text-white',
  'bg-google-red-600 text-white',
  // Yellow takes a dark glyph. Google's yellow ramp tops out around #F29900, so
  // white on it never clears 3:1 at any weight - there is no darker step to
  // reach for. Google's own material sets dark content on this colour for the
  // same reason, which is why it reads as intentional rather than as the one
  // badge that failed.
  'bg-google-yellow-500 text-ink-900',
  'bg-google-green-700 text-white',
] as const

/**
 * The important-links grid, in the reference's own form.
 *
 * Separate white cards with the icon on the LEFT and the label beside it, and
 * no description under either. The reference gives these tiles a label and
 * nothing else, and it is right to: a sentence under each of twelve entries
 * turns a directory a reader scans into a page they have to read.
 *
 * Colour lives in the ICON BADGE rather than in the card. That is where the
 * reference puts its own illustrations, it keeps the four Google hues coding
 * the columns, and it stops twelve saturated blocks from becoming the loudest
 * thing on a government page.
 */
function PortalLinkGrid({ tiles }: { tiles: PortalTile[] }): React.JSX.Element {
  return (
    <ul className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {tiles.map((tile, index) => (
        <li key={tile.label}>
          <a
            href={signInFor(tile.to)}
            className="interactive-surface flex h-full items-center gap-3 rounded-lg border border-ink-200 bg-surface px-4 py-3.5 shadow-card hover:border-google-blue-300 hover:bg-google-blue-50"
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
              <span className="ml-auto shrink-0 rounded-sm bg-crit-500 px-1.5 py-0.5 text-[0.5625rem] font-bold tracking-[0.08em] text-white uppercase">
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
 * The related-links cards, in the reference's own form: a large round badge
 * centred over a centred label, four across, standing on a coloured plinth
 * that begins below the cards' heads so the row reads as one band rather than
 * as four loose tiles.
 */
function PortalCardRow({ tiles }: { tiles: PortalTile[] }): React.JSX.Element {
  return (
    <ul className="relative grid grid-cols-2 gap-4 px-4 pb-16 lg:grid-cols-4 lg:px-8">
      {tiles.map((tile, index) => (
        <li key={tile.label}>
          <a
            href={signInFor(tile.to)}
            className="interactive-surface flex h-full flex-col items-center gap-3 rounded-lg border border-ink-200 bg-surface px-4 py-6 text-center shadow-card hover:border-google-blue-300 hover:bg-google-blue-50"
          >
            <span
              className={cn(
                'flex h-14 w-14 items-center justify-center rounded-full',
                COLUMN_HUES[index % COLUMN_HUES.length],
              )}
              aria-hidden
            >
              <tile.icon className="h-7 w-7" />
            </span>
            <span className="text-[0.8125rem] leading-snug font-semibold text-ink-800">{tile.label}</span>
          </a>
        </li>
      ))}
    </ul>
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
  RELATED_LINKS = build$RELATED_LINKS()
})

/* ==========================================================================
   Page
   ========================================================================== */

export function PortalLandingPage(): React.JSX.Element {
  const navigate = useNavigate()
  const corporation = useActiveCorporation()
  const locale = useApplyLocale()

  const menuRailRef = useRef<HTMLUListElement>(null)
  const [canSlideLeft, setCanSlideLeft] = useState(false)
  const [canSlideRight, setCanSlideRight] = useState(false)

  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [fontStep, setFontStep] = useState(0)
  const [feedPaused, setFeedPaused] = useState(false)
  const [bannerSlide, setBannerSlide] = useState(0)
  const [bannerPaused, setBannerPaused] = useState(false)
  const [noticeTab, setNoticeTab] = useState(NOTICE_TABS[0]?.id ?? 'new')
  const [relatedPage, setRelatedPage] = useState(0)

  // The related-links carousel runs four to a page and wraps at both ends.
  // The page is clamped on read rather than reset in an effect: a language
  // switch rebuilds the catalogue, and a carousel parked past the last page
  // would render an empty band until the reader happened to press an arrow.
  const relatedPages = Math.max(1, Math.ceil(RELATED_LINKS.length / 4))
  const relatedStart = Math.min(relatedPage, relatedPages - 1) * 4
  const shownRelated = RELATED_LINKS.slice(relatedStart, relatedStart + 4)
  const navRef = useRef<HTMLDivElement | null>(null)

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

  /** A click anywhere outside the menu bar closes the open mega-menu. */
  useEffect(() => {
    if (!openMenu) return
    const onDown = (event: MouseEvent): void => {
      if (navRef.current && !navRef.current.contains(event.target as Node)) setOpenMenu(null)
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpenMenu(null)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [openMenu])

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
   * be drawn from the intelligence surfaces behind it - the figures here are
   * the ones a corporation already publishes on its own portal, and no more.
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
  /*
   * The sliding section rail.
   *
   * `scrollWidth > clientWidth` is the only honest test for "there is more this
   * way" — it accounts for the actual rendered width of the sections, which
   * varies with the language (a Marathi label is not the width of its English
   * one) and with the viewport. Deciding from a hard-coded section count would
   * be wrong in Marathi and wrong on every width but one.
   *
   * The one-pixel tolerance is not superstition: sub-pixel layout means a rail
   * scrolled fully right commonly lands at 811.4 of 812, and without it the
   * right arrow stays lit forever pointing at nothing.
   */
  const syncSlideAffordances = (): void => {
    const rail = menuRailRef.current
    if (!rail) return
    setCanSlideLeft(rail.scrollLeft > 1)
    setCanSlideRight(rail.scrollLeft + rail.clientWidth < rail.scrollWidth - 1)
  }

  /** Slides by most of a viewport, keeping a sliver of context across the jump. */
  const slideMenus = (direction: 1 | -1): void => {
    const rail = menuRailRef.current
    if (!rail) return
    rail.scrollBy({ left: direction * rail.clientWidth * 0.8, behavior: 'smooth' })
  }

  // Re-measured on mount, on resize and on a language switch — each changes the
  // rendered width of the rail, and a stale measurement leaves an arrow either
  // missing when it is needed or lit when it does nothing.
  useEffect(() => {
    syncSlideAffordances()
    window.addEventListener('resize', syncSlideAffordances)
    return () => window.removeEventListener('resize', syncSlideAffordances)
  }, [locale])

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
      {/* mcgm.gov.in opens on a solid deep-blue utility bar - it is the single
          most recognisable thing about the corporation's own portal, and a
          Mumbai citizen arriving here should land on the same band. The
          controls inside it are unchanged; only the ground they sit on is. */}
      <div className="bg-portal-700 text-white">
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
      <div className="sticky top-0 z-30 border-b border-portal-900 bg-portal-800 shadow-sm">
        <div className="mx-auto flex max-w-[80rem] items-center gap-2.5 px-4 py-1.5">
          <span className="flex shrink-0 items-center gap-1.5 rounded-sm bg-crit-500 px-1.5 py-0.5 text-[0.625rem] font-bold tracking-[0.08em] text-white uppercase ring-1 ring-crit-300 ring-inset">
            <span aria-hidden className="animate-pulse-soft h-1.5 w-1.5 rounded-full bg-white" />
            {t('Live')}
          </span>
          <span className="hidden shrink-0 text-[0.6875rem] font-semibold text-white sm:inline">
            {t('Latest updates')}
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
                        href={signInFor(item.to)}
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
      {/* A WHITE masthead between two blue bands, following mcgm.gov.in: blue
          utility strip above, white masthead here, blue navigation below,
          closed by the gold rule that separates the whole header from the hero.

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
              This build serves twenty-nine corporations from one core, and a
              masthead reading "Brihanmumbai Municipal Corporation" told every
              visitor the opposite - that they were looking at one city's site.
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
            <a
              href={`tel:1916`}
              className="inline-flex items-center gap-2 self-start rounded-md bg-crit-500 px-2.5 py-1 text-[0.75rem] font-semibold text-white ring-1 ring-crit-300 ring-inset md:self-auto"
            >
              <Phone className="h-3.5 w-3.5" aria-hidden />
              {t('24×7 helpline 1916')}
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
                        <a href={signInFor(link.to)} className="block px-3 py-1.5 text-[0.75rem] text-portal-700 hover:bg-portal-50">
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
      {/* Primary navigation - segmented by decision surface           */}
      {/* ============================================================ */}
      {/* The navigation carries the corporation's portal blue, closing the
          chrome that the utility bar opened: blue band, white masthead, blue
          band. It sits directly on top of the photographic hero, and the two
          are one block of chrome that has to read as one. */}
      <div ref={navRef} className="relative z-20 bg-portal-700">
        <nav aria-label={t('Portal navigation')} className="relative mx-auto flex max-w-[80rem] items-stretch px-2">
          {/* One line, always. A tab bar that wraps reads as two bars, and the
              menu that drops to the second row looks like an afterthought
              rather than a peer of the others. Below the width where every
              section fits, the bar slides sideways instead — which is what a
              tab bar on a government portal does on a handset.

              The arrows exist because sideways scroll is otherwise invisible on
              a desktop with no touch and no horizontal wheel: the row simply
              looks truncated, and the sections past the edge are not so much
              hidden as unknown. Each is hidden the moment its direction is
              exhausted, so a lit arrow always means there is more that way. */}
          <button
            type="button"
            aria-label={t('Scroll sections left')}
            onClick={() => slideMenus(-1)}
            className={cn(
              'z-10 -mr-2 shrink-0 self-stretch bg-gradient-to-r from-portal-700 via-portal-700 to-transparent pr-4 pl-1 text-white/70 transition-colors hover:text-white',
              !canSlideLeft && 'pointer-events-none opacity-0',
            )}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>

          <ul
            ref={menuRailRef}
            onScroll={syncSlideAffordances}
            className="scrollbar-none flex min-w-0 flex-1 flex-nowrap overflow-x-auto scroll-smooth"
          >
            {PORTAL_MENUS.map((menu) => (
              <li key={menu.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => setOpenMenu(openMenu === menu.id ? null : menu.id)}
                  aria-expanded={openMenu === menu.id}
                  /* The open tab is marked by a gold underline rather than by
                     a lighter fill. The reference portal signals the active
                     menu the same way, and an underline survives the drop
                     panel opening beneath it where a fill would fight it. */
                  className={cn(
                    'flex items-center gap-1 border-b-[3px] border-transparent px-3 py-2.5 text-[0.8125rem] font-medium whitespace-nowrap text-white/90 transition-colors hover:bg-white/10 hover:text-white',
                    openMenu === menu.id && 'border-gold-500 bg-white/10 text-white',
                  )}
                >
                  {menu.label}
                  <ChevronDown
                    className={cn('h-3.5 w-3.5 transition-transform', openMenu === menu.id && 'rotate-180')}
                    aria-hidden
                  />
                </button>
              </li>
            ))}
          </ul>

          <button
            type="button"
            aria-label={t('Scroll sections right')}
            onClick={() => slideMenus(1)}
            className={cn(
              'z-10 -ml-2 shrink-0 self-stretch bg-gradient-to-l from-portal-700 via-portal-700 to-transparent pr-1 pl-4 text-white/70 transition-colors hover:text-white',
              !canSlideRight && 'pointer-events-none opacity-0',
            )}
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </nav>

        {openMenu ? (
          <div className="absolute inset-x-0 top-full border-b border-ink-200 bg-surface shadow-drawer">
            <div className="mx-auto grid max-w-[80rem] grid-cols-1 gap-x-8 gap-y-5 px-4 py-5 sm:grid-cols-2 lg:grid-cols-3">
              {PORTAL_MENUS.find((m) => m.id === openMenu)?.groups.map((group, index) => (
                /* Keyed by position: the columns of one section's destinations
                   carry no headings to key on, and their order is the order the
                   navigation states. */
                <div key={index}>
                  {group.heading ? (
                    <p className="text-[0.6875rem] font-bold tracking-[0.08em] text-ink-400 uppercase">
                      {group.heading}
                    </p>
                  ) : null}
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {group.links.map((link) => (
                      <li key={link.label}>
                        {link.to ? (
                          <a href={signInFor(link.to)} className="text-[0.8125rem] text-portal-700 hover:underline">
                            {link.label}
                          </a>
                        ) : (
                          /* Not a link: this platform does not implement the
                             service, and offering a destination it cannot
                             reach would be worse than saying so. */
                          <span className="cursor-help text-[0.8125rem] text-ink-500" title={link.note}>
                            {link.label}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

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
          <div
            className="mx-auto grid max-w-[80rem] grid-cols-1 px-4 pt-12 pb-28 lg:pt-14 lg:pb-32"
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
                  className="mcgm-slide grid grid-cols-1 items-center gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]"
                  data-active={active}
                  aria-hidden={!active}
                >
                  <div className="min-w-0">
                    <Heading className="max-w-2xl text-[clamp(1.5rem,2.9vw,2.125rem)] leading-[1.25] font-bold tracking-[-0.015em] text-white">
                      {slide.heading}
                    </Heading>

                    <p className="mt-7 text-[1.0625rem] font-semibold text-white">{t('Key features:')}</p>
                    <ul className="mt-3 flex flex-col gap-2.5">
                      {slide.features.map((feature) => (
                        <li
                          key={feature}
                          className="flex items-start gap-3 text-[0.9375rem] leading-relaxed text-white/90"
                        >
                          <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-white/70" />
                          {feature}
                        </li>
                      ))}
                    </ul>

                    <a
                      href={signInFor(slide.to)}
                      tabIndex={active ? undefined : -1}
                      className="interactive-surface mt-8 inline-flex items-center gap-2 rounded-md bg-white px-5 py-3 text-[0.875rem] font-semibold text-[color:var(--mcgm-ground-deep)] hover:bg-white/90"
                    >
                      {slide.action}
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    </a>
                  </div>

                  {/* The collage. Two circular cut-outs in gold rings over a
                      large tinted disc, as the reference sets it. Photographs
                      are the civic ones already credited in the footer - no
                      new imagery, and nothing that could read as this
                      corporation's own building. */}
                  <div aria-hidden className="relative hidden h-[19rem] lg:block">
                    <span className="absolute top-4 right-0 h-[15rem] w-[15rem] rounded-full bg-[color:var(--mcgm-skyline)] opacity-25" />
                    <img
                      src={slide.photos[0].src}
                      alt=""
                      loading={index === 0 ? 'eager' : 'lazy'}
                      decoding="async"
                      style={{ objectPosition: slide.photos[0].focus }}
                      className="mcgm-cutout absolute top-0 right-[7.5rem] h-[13rem] w-[13rem] rounded-full object-cover"
                    />
                    <img
                      src={slide.photos[1].src}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      style={{ objectPosition: slide.photos[1].focus }}
                      className="mcgm-cutout absolute right-[16.5rem] bottom-0 h-[9.5rem] w-[9.5rem] rounded-full object-cover"
                    />
                  </div>
                </div>
              )
            })}
          </div>

          {/* The wave and the skyline. One inline SVG rather than an image:
              it is two flat shapes, it has to sit exactly on the band's foot
              at every width, and it must not cost a request. */}
          <svg
            aria-hidden
            viewBox="0 0 1440 150"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[7.5rem] w-full"
          >
            <path d="M0 78C220 26 470 8 720 30c250 22 470 66 720 52v68H0Z" fill="var(--mcgm-wave)" />
            {/* The skyline stands ON the wave, so it is translated down onto
                the curve rather than sitting on the viewBox floor. */}
            <g fill="var(--mcgm-skyline)" transform="translate(150 46)">
              <rect x="0" y="26" width="14" height="34" />
              <rect x="18" y="14" width="10" height="46" />
              <path d="M32 60V22l12-12 12 12v38Z" />
              <rect x="60" y="30" width="16" height="30" />
              <rect x="80" y="6" width="8" height="54" />
              <path d="M92 60V26h26v34Z" />
              <circle cx="105" cy="20" r="9" />
              <rect x="122" y="34" width="12" height="26" />
              <path d="M138 60V18l10-10 10 10v42Z" />
              <rect x="162" y="28" width="18" height="32" />
              <rect x="184" y="12" width="9" height="48" />
              <path d="M197 60V30h22v30Z" />
              <circle cx="208" cy="24" r="8" />
              <rect x="223" y="36" width="14" height="24" />
              <rect x="241" y="20" width="11" height="40" />
              <path d="M256 60V32h20v28Z" />
            </g>
          </svg>
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
                    className="mcgm-dot h-2 w-2 rounded-full"
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
                with the generic terms rather than
                `terminology.primaryUnitPlural`: the composed term reaches
                `t()` through a template literal, which the catalogue
                extractor cannot see, and the entry that renders here would be
                reported as orphaned and pruned. */}
            <dl className="flex flex-wrap items-center gap-x-6 gap-y-2">
              {[
                { label: t('Wards'), value: formatNumber(municipality.administrativeUnits.wards) },
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
        {/* What the platform runs on this deployment                    */}
        {/* ============================================================ */}
        {/* The banner's first slide scrolls here. It used to target the
            use-cases band; with that band gone this is the nearest thing to
            "see what it decides", and an anchor pointing at nothing would send
            the reader to the top of the page instead. */}
        <section id="surfaces" className="border-b border-ink-200 bg-surface">
          <div className="mx-auto max-w-[80rem] px-4 py-12 lg:py-14">
            <div className="max-w-2xl">
              <p className="text-[0.6875rem] font-bold tracking-[0.14em] text-govt-600 uppercase">
                {t('The platform')}
              </p>
              <h2 className="mt-2 text-[1.75rem] leading-tight font-semibold tracking-[-0.02em] text-ink-900">
                {t('The intelligence surfaces behind this portal')}
              </h2>
              <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-600">
                {t('What this page shows is the front of it. Behind sign-in the same figures are assembled into the surfaces an officer actually decides from — one for each domain the corporation operates.')}
              </p>
            </div>

            <ul className="mt-9 grid grid-cols-1 gap-px overflow-hidden rounded-lg bg-ink-100 ring-1 ring-ink-200 sm:grid-cols-2 lg:grid-cols-4">
              {SURFACES.map((surface, index) => (
                <li key={surface.label}>
                  <a
                    href={signInFor(surface.to)}
                    className="interactive-surface flex h-full flex-col gap-2.5 bg-surface p-5 hover:bg-google-blue-50"
                  >
                    <span
                      className={cn(
                        'flex h-9 w-9 items-center justify-center rounded-lg',
                        COLUMN_HUES[index % COLUMN_HUES.length],
                      )}
                      aria-hidden
                    >
                      <surface.icon className="h-[1.125rem] w-[1.125rem]" />
                    </span>
                    <span className="text-[0.875rem] leading-tight font-semibold text-ink-900">{surface.label}</span>
                    <span className="text-[0.75rem] leading-relaxed text-ink-500">{surface.note}</span>
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
          <div className="mx-auto max-w-[80rem] px-4 py-12 lg:py-14">
            <div className="max-w-2xl">
              <p className="text-[0.6875rem] font-bold tracking-[0.14em] text-govt-600 uppercase">{t('Assurance')}</p>
              <h2 className="mt-2 text-[1.75rem] leading-tight font-semibold tracking-[-0.02em] text-ink-900">
                {t('Built to be answerable')}
              </h2>
              <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-600">
                {t('A decision an officer cannot account for is worse than no decision. Four properties hold across every surface behind this portal, and each of them is inspectable from inside the platform.')}
              </p>
            </div>

            <ul className="mt-9 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              {ASSURANCES.map((item, index) => (
                <li key={item.label} className="rounded-lg border border-ink-200 bg-surface p-5 shadow-card">
                  <span className="numeric text-[0.6875rem] font-bold tracking-[0.1em] text-ink-300">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <p className="mt-2 text-[0.9375rem] leading-snug font-semibold text-ink-900">{item.label}</p>
                  <p className="mt-2 text-[0.75rem] leading-relaxed text-ink-500">{item.note}</p>
                  <a
                    href={signInFor(item.to)}
                    className="mt-3 inline-flex items-center gap-1 text-[0.75rem] font-semibold text-govt-700 hover:underline"
                  >
                    {item.linkLabel}
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden />
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
            <h2 className="text-center text-[1.625rem] leading-tight font-semibold tracking-[-0.02em] text-ink-900">
              {t('Notices and updates')}
            </h2>
            <span aria-hidden className="mcgm-heading-rule mx-auto mt-3 block h-[3px] w-14 rounded-full" />

            <div className="mt-9 grid grid-cols-1 gap-6 lg:grid-cols-[5fr_7fr]">
              {/* ---- The two illustrated cards ----------------------- */}
              <ul className="flex flex-col gap-4">
                {NOTICE_FEATURES.map((feature) => (
                  <li
                    key={feature.title}
                    className="flex flex-col rounded-lg border border-ink-200 border-b-2 border-b-google-blue-600 bg-surface p-4 shadow-card"
                  >
                    <div className="flex items-start gap-3.5">
                      <img
                        src={feature.photo.src}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        aria-hidden
                        style={{ objectPosition: feature.photo.focus }}
                        className="h-[4.5rem] w-[4.5rem] shrink-0 rounded-md object-cover ring-1 ring-ink-200"
                      />
                      <div className="min-w-0">
                        <p className="text-[0.875rem] leading-snug font-bold text-ink-900">{feature.title}</p>
                        <p className="mt-1.5 text-[0.75rem] leading-relaxed text-ink-500">{feature.blurb}</p>
                      </div>
                    </div>
                    {/* Bottom-right, as the reference sets it. */}
                    <a
                      href={signInFor(feature.to)}
                      className="mt-3 flex items-center justify-end gap-1 text-[0.75rem] font-semibold text-google-blue-700 hover:underline"
                    >
                      {t('Read more')}
                      <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                    </a>
                  </li>
                ))}
              </ul>

              {/* ---- The tabbed board -------------------------------- */}
              <div className="rounded-lg border border-ink-200 bg-surface p-4 shadow-card">
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
                    className="mt-4 divide-y divide-ink-100 border-y border-ink-100"
                  >
                    {tab.items.map((item) => (
                      <li key={item.label}>
                        <a
                          href={signInFor(item.to)}
                          className="flex items-center gap-2.5 px-1 py-2.5 text-[0.8125rem] text-ink-700 transition-colors hover:text-google-blue-700"
                        >
                          <item.icon className="h-4 w-4 shrink-0 text-google-blue-700" aria-hidden />
                          <span className="min-w-0 flex-1">{item.label}</span>
                          {item.isNew ? (
                            <span className="shrink-0 rounded-sm bg-crit-500 px-1.5 py-0.5 text-[0.5625rem] font-bold tracking-[0.08em] text-white uppercase">
                              {t('New')}
                            </span>
                          ) : null}
                        </a>
                      </li>
                    ))}
                  </ul>
                ))}

                <a
                  href={signInFor(ROUTES.intelligenceFeed)}
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
        <section className="border-b border-ink-200 bg-surface-sunken">
          <div className="mx-auto max-w-[80rem] px-4 py-12 lg:py-14">
            <h2 className="text-center text-[1.625rem] leading-tight font-semibold tracking-[-0.02em] text-ink-900">
              {t('Important links')}
            </h2>
            <span aria-hidden className="mcgm-heading-rule mx-auto mt-3 block h-[3px] w-14 rounded-full" />

            <PortalLinkGrid tiles={QUICK_LINKS} />

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
                    href={signInFor(ROUTES.copilot)}
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
        {/* Related links                                                */}
        {/* ============================================================ */}
        <section className="border-b border-ink-200 bg-surface">
          <div className="mx-auto max-w-[80rem] px-4 py-12 lg:py-14">
            <h2 className="text-center text-[1.625rem] leading-tight font-semibold tracking-[-0.02em] text-ink-900">
              {t('Related links')}
            </h2>
            <span aria-hidden className="mcgm-heading-rule mx-auto mt-3 block h-[3px] w-14 rounded-full" />

            {/* The cards stand on a coloured plinth that starts below their
                heads, so the row reads as one band rather than four loose
                tiles - which is how the reference sets this section, and the
                one place on its page where a solid colour block appears under
                content rather than behind a heading. The plinth is decoration
                and is marked as such. */}
            <div className="relative mt-8">
              <span aria-hidden className="absolute inset-x-0 top-14 bottom-0 rounded-xl bg-google-blue-700" />
              <PortalCardRow tiles={shownRelated} />

              <div className="absolute inset-x-0 bottom-5 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setRelatedPage((page) => (page - 1 + relatedPages) % relatedPages)}
                  aria-label={t('Previous related links')}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-surface text-google-blue-700 shadow-card transition-colors hover:bg-google-blue-50"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                </button>
                <span className="numeric text-[0.75rem] font-semibold text-white">
                  {t('{0} of {1}', formatNumber(Math.min(relatedPage, relatedPages - 1) + 1), formatNumber(relatedPages))}
                </span>
                <button
                  type="button"
                  onClick={() => setRelatedPage((page) => (page + 1) % relatedPages)}
                  aria-label={t('Next related links')}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-surface text-google-blue-700 shadow-card transition-colors hover:bg-google-blue-50"
                >
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ============================================================ */}
      {/* Feedback tab - the vertical tab every portal in this state    */}
      {/* carries on the right edge                                     */}
      {/* ============================================================ */}
      <a
        href={signInFor(ROUTES.citizenServices)}
        className="fixed top-1/2 right-0 z-30 hidden -translate-y-1/2 rounded-l-md bg-google-blue-600 px-2 py-5 text-[0.75rem] font-bold tracking-wide text-white shadow-drawer [writing-mode:vertical-rl] hover:bg-google-blue-700 lg:block"
      >
        {t('Feedback')}
      </a>

      {/* ============================================================ */}
      {/* Footer                                                       */}
      {/* ============================================================ */}
      <footer className="border-t border-ink-200 bg-surface-sunken">
        <div className="mx-auto max-w-[80rem] px-4 py-10">
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {/* ---- Find the office ------------------------------- */}
            <div>
              <p className="flex items-center gap-2 text-[0.9375rem] font-bold text-ink-900">
                <MapPin className="h-4 w-4 text-google-blue-700" aria-hidden />
                {t('Finding the office')}
              </p>
              <p className="mt-3 text-[0.75rem] leading-relaxed text-ink-600">{corporation.headquarters}</p>
              <p className="mt-2 text-[0.75rem] leading-relaxed text-ink-600">
                {t('The control room answers round the clock, on every day of the year, for civic emergencies and for lodging a complaint.')}
              </p>
              <a
                href={`tel:1916`}
                className="mt-3 inline-flex items-center gap-2 rounded-md bg-crit-50 px-2.5 py-1.5 text-[0.8125rem] font-semibold text-crit-700 ring-1 ring-crit-200 ring-inset"
              >
                <Phone className="h-4 w-4" aria-hidden />
                {t('24×7 helpline 1916')}
              </a>
            </div>

            {/* ---- Contact --------------------------------------- */}
            <div>
              <p className="flex items-center gap-2 text-[0.9375rem] font-bold text-ink-900">
                <MessageCircle className="h-4 w-4 text-google-blue-700" aria-hidden />
                {t('Contact')}
              </p>
              <p className="mt-3 text-[0.75rem] leading-relaxed text-ink-600">
                {t('Where an officer goes when the platform is the problem rather than the city.')}
              </p>
              <ul className="mt-3 flex flex-col gap-1.5 text-[0.75rem] text-ink-600">
                {[
                  { icon: MessageCircle, label: t('Platform service desk') },
                  { icon: AtSign, label: t('Requesting access for a post') },
                  { icon: Share2, label: t('Owners of each data source') },
                  { icon: Rss, label: t('Release notes and changes') },
                ].map((row) => (
                  <li key={row.label} className="flex items-center gap-2">
                    <row.icon className="h-3.5 w-3.5 shrink-0 text-ink-400" aria-hidden />
                    {row.label}
                  </li>
                ))}
              </ul>
            </div>

            {/* ---- Information ----------------------------------- */}
            <div>
              <p className="flex items-center gap-2 text-[0.9375rem] font-bold text-ink-900">
                <Info className="h-4 w-4 text-google-blue-700" aria-hidden />
                {t('Information')}
              </p>
              <dl className="mt-3 flex flex-col gap-1.5 text-[0.75rem] text-ink-600">
                {[
                  { label: t('Last reviewed and updated'), value: formatDate(DEMO_NOW) },
                  { label: t('Visitors today'), value: formatNumber(counters.today) },
                  { label: t('Total visitors'), value: formatNumber(counters.total) },
                ].map((row) => (
                  <div key={row.label} className="flex items-baseline justify-between gap-3">
                    <dt>{row.label}</dt>
                    <dd className="numeric font-semibold text-ink-800">{row.value}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {['GIGW', 'W3C', 'WCAG 2.1'].map((mark) => (
                  <span
                    key={mark}
                    className="rounded border border-ink-200 bg-surface px-1.5 py-0.5 text-[0.625rem] font-semibold text-ink-500"
                  >
                    {mark}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <ul className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-ink-200 pt-4 text-[0.75rem] text-ink-600">
            {[
              t('Privacy policy'),
              t('Disclaimer'),
              t('Contact us'),
              t('Accessibility statement'),
              t('Site map'),
            ].map((label) => (
              <li key={label} className="border-l border-ink-300 pl-3 first:border-l-0 first:pl-0">
                {label}
              </li>
            ))}
          </ul>

          {/* What this page is. Stated in the footer, where a government
              portal states its ownership, because a portal facade that does
              not say so is the one thing on this page that could mislead. */}
          <p className="mt-4 border-t border-ink-200 pt-3 text-[0.6875rem] leading-relaxed text-ink-400">
            {t('This is a demonstration of the {0} platform, rendered for {1}. It is not the corporation’s live portal, no municipal system is contacted, and no transaction on this page is real.', municipality.branding.productFamily, corporationName(corporation))}
          </p>
          {/* The photographs are of state institutions, not of this
              corporation. Said here as well as in the caption, because a
              building on a government page is read as a claim about whose
              page it is. */}
          <p className="text-[0.6875rem] leading-relaxed text-ink-400">
            {t('The photograph on this page is of Mantralaya in Mumbai, the seat of the state government, shown as civic imagery. It is not the headquarters of {0}.', corporationName(corporation))}
          </p>
        </div>
      </footer>
    </div>
  )
}

export default PortalLandingPage
