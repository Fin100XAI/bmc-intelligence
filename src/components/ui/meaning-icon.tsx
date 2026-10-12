import type { ReactNode } from 'react'
import {
  Activity,
  AlertOctagon,
  BarChart3,
  Building2,
  Bus,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  CloudRain,
  Database,
  Droplets,
  FileText,
  Flame,
  Gauge,
  GraduationCap,
  HardHat,
  HeartPulse,
  IndianRupee,
  Info,
  Landmark,
  Leaf,
  Lightbulb,
  Link2,
  MapPin,
  MessageSquareWarning,
  Network,
  Percent,
  Route,
  ShieldCheck,
  Siren,
  Timer,
  Trash2,
  TrendingUp,
  TriangleAlert,
  Users,
  Wind,
  Zap,
} from 'lucide-react'
import type { Shade } from './shade'

/**
 * A fitting icon for a card that was not given one, so every headline card on
 * the platform carries the same solid icon chip as the Executive Overview and
 * Decision Room cards. The label is read first (what the figure is about);
 * failing that, the card's shade (what the figure means) picks the icon.
 */
const BY_LABEL: Array<[RegExp, (cls: string) => ReactNode]> = [
  [/₹|\bcrore\b|\bcr\b|revenue|budget|fund|grant|arrears|expenditure|spend|\bcosts?\b|\btax|\bfees?\b|rupee|financ|saving|money|tender|procure/i, (c) => <IndianRupee className={c} />],
  [/\baqi\b|\bair\b|pm2|pm10|pollut|emission|noise/i, (c) => <Wind className={c} />],
  [/water|reservoir|\bmld\b|supply|pipe|sewage|drain|stp\b/i, (c) => <Droplets className={c} />],
  [/\brain|monsoon|flood|\btides?\b|creek|waterlog/i, (c) => <CloudRain className={c} />],
  [/health|hospital|clinic|disease|dengue|malaria|maternity|phc|patient|medical/i, (c) => <HeartPulse className={c} />],
  [/waste|garbage|sanitation|toilet|landfill|hotspot/i, (c) => <Trash2 className={c} />],
  [/fire|emergency/i, (c) => <Flame className={c} />],
  [/incident|alert|escalat/i, (c) => <Siren className={c} />],
  [/complaint|grievance|petition/i, (c) => <MessageSquareWarning className={c} />],
  [/\bwards?\b|\bzones?\b|locality|localities|\bnodes?\b|\bareas?\b|location|\bmaps?\b|\bgis\b|layer/i, (c) => <MapPin className={c} />],
  [/project|\bworks?\b|contract|construction|\broads?\b|bridge|asset|infrastructure/i, (c) => <HardHat className={c} />],
  [/transport|\bbus\b|traffic|transit|mobility/i, (c) => <Bus className={c} />],
  [/\blight|\bled\b|energy|power|electric|solar/i, (c) => <Zap className={c} />],
  [/school|education|student|teacher/i, (c) => <GraduationCap className={c} />],
  [/green|tree|garden|park|biodiversity|environment|climate|mangrove/i, (c) => <Leaf className={c} />],
  [/citizen|resident|population|people|\busers?\b|principal|staff|officer|\broles?\b|household|beneficiar/i, (c) => <Users className={c} />],
  [/\bdays?\b|\bdates?\b|deadline|\bdue\b|overdue|calendar|\bweeks?\b|\bmonths?\b|\byears?\b/i, (c) => <CalendarClock className={c} />],
  [/time|minutes?|hours?|\bsla\b|response|latency|duration/i, (c) => <Timer className={c} />],
  [/%|\brates?\b|\bshare\b|percent|coverage|efficien|utilis|realis|ratio/i, (c) => <Percent className={c} />],
  [/score|index|readiness|grade|rank/i, (c) => <Gauge className={c} />],
  [/trend|forecast|growth|variance|change/i, (c) => <TrendingUp className={c} />],
  [/decision|case|task|action|queue|backlog|pending|review/i, (c) => <ClipboardList className={c} />],
  [/source|dataset|data|record|registry|connector|integration|feed|pipeline/i, (c) => <Database className={c} />],
  [/\blinks?\b|depend|cross|graph|network|\bedges?\b/i, (c) => <Network className={c} />],
  [/route|path|journey|step/i, (c) => <Route className={c} />],
  [/policy|polic|security|privacy|access|audit|compliance|trust|mfa/i, (c) => <ShieldCheck className={c} />],
  [/report|document|\bbriefs?\b|evidence|\bfiles?\b/i, (c) => <FileText className={c} />],
  [/building|property|propert|housing|amenit|facilit|centre|center/i, (c) => <Building2 className={c} />],
  [/council|corporator|resolution|committee|meeting|scheme|government/i, (c) => <Landmark className={c} />],
  [/insight|recommend|idea|opportunit/i, (c) => <Lightbulb className={c} />],
  [/connect|\bsync|\bapi\b/i, (c) => <Link2 className={c} />],
  [/activity|\bevents?\b|signal|reading|indicator/i, (c) => <Activity className={c} />],
]

const BY_SHADE: Partial<Record<Shade, (cls: string) => ReactNode>> = {
  red: (c) => <AlertOctagon className={c} />,
  orange: (c) => <TriangleAlert className={c} />,
  amber: (c) => <TriangleAlert className={c} />,
  green: (c) => <CheckCircle2 className={c} />,
  gold: (c) => <IndianRupee className={c} />,
  neutral: (c) => <Info className={c} />,
}

export function meaningIcon(label: unknown, shade: Shade, className = 'h-4 w-4'): ReactNode {
  // A gold card is money by definition, whatever its label says.
  if (shade === 'gold') return <IndianRupee className={className} />
  const text = typeof label === 'string' || typeof label === 'number' ? String(label) : ''
  if (text) {
    for (const [re, make] of BY_LABEL) if (re.test(text)) return make(className)
  }
  const byShade = BY_SHADE[shade]
  return byShade ? byShade(className) : <BarChart3 className={className} />
}
