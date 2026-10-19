import { useCSSVariable } from 'uniwind'
import {
  AlertTriangle as AlertTriangleIcon,
  ArrowDown as ArrowDownIcon,
  ArrowRight as ArrowRightIcon,
  ArrowUp as ArrowUpIcon,
  BarChart2 as BarChart2Icon,
  Bell as BellIcon,
  Calendar as CalendarIcon,
  Check as CheckIcon,
  CheckCircle2 as CheckCircle2Icon,
  ChevronDown as ChevronDownIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Clock as ClockIcon,
  Clock3 as Clock3Icon,
  Database as DatabaseIcon,
  Dumbbell as DumbbellIcon,
  Edit3 as Edit3Icon,
  Globe2 as Globe2Icon,
  History as HistoryIcon,
  Home as HomeIcon,
  Lock as LockIcon,
  LogOut as LogOutIcon,
  MoreHorizontal as MoreHorizontalIcon,
  Palette as PaletteIcon,
  Play as PlayIcon,
  Plus as PlusIcon,
  Ruler as RulerIcon,
  ScrollText as ScrollTextIcon,
  Search as SearchIcon,
  Settings as SettingsIcon,
  ShieldCheck as ShieldCheckIcon,
  Timer as TimerIcon,
  Trash2 as Trash2Icon,
  Trophy as TrophyIcon,
  UserRound as UserRoundIcon,
  Weight as WeightIcon,
  X as XIcon,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react-native'

type IconProps = LucideProps

function cadenceIcon(Icon: LucideIcon) {
  return function CadenceIcon({ color, ...props }: IconProps) {
    const foreground = useCSSVariable('--color-foreground')
    const resolvedColor = color ?? (typeof foreground === 'string' ? foreground : '#2D2235')

    return <Icon {...props} color={resolvedColor} />
  }
}

export const AlertTriangle = cadenceIcon(AlertTriangleIcon)
export const ArrowDown = cadenceIcon(ArrowDownIcon)
export const ArrowRight = cadenceIcon(ArrowRightIcon)
export const ArrowUp = cadenceIcon(ArrowUpIcon)
export const BarChart2 = cadenceIcon(BarChart2Icon)
export const Bell = cadenceIcon(BellIcon)
export const Calendar = cadenceIcon(CalendarIcon)
export const Check = cadenceIcon(CheckIcon)
export const CheckCircle2 = cadenceIcon(CheckCircle2Icon)
export const ChevronDown = cadenceIcon(ChevronDownIcon)
export const ChevronLeft = cadenceIcon(ChevronLeftIcon)
export const ChevronRight = cadenceIcon(ChevronRightIcon)
export const Clock = cadenceIcon(ClockIcon)
export const Clock3 = cadenceIcon(Clock3Icon)
export const Database = cadenceIcon(DatabaseIcon)
export const Dumbbell = cadenceIcon(DumbbellIcon)
export const Edit3 = cadenceIcon(Edit3Icon)
export const Globe2 = cadenceIcon(Globe2Icon)
export const History = cadenceIcon(HistoryIcon)
export const Home = cadenceIcon(HomeIcon)
export const Lock = cadenceIcon(LockIcon)
export const LogOut = cadenceIcon(LogOutIcon)
export const MoreHorizontal = cadenceIcon(MoreHorizontalIcon)
export const Palette = cadenceIcon(PaletteIcon)
export const Play = cadenceIcon(PlayIcon)
export const Plus = cadenceIcon(PlusIcon)
export const Ruler = cadenceIcon(RulerIcon)
export const ScrollText = cadenceIcon(ScrollTextIcon)
export const Search = cadenceIcon(SearchIcon)
export const Settings = cadenceIcon(SettingsIcon)
export const ShieldCheck = cadenceIcon(ShieldCheckIcon)
export const Timer = cadenceIcon(TimerIcon)
export const Trash2 = cadenceIcon(Trash2Icon)
export const Trophy = cadenceIcon(TrophyIcon)
export const UserRound = cadenceIcon(UserRoundIcon)
export const Weight = cadenceIcon(WeightIcon)
export const X = cadenceIcon(XIcon)
