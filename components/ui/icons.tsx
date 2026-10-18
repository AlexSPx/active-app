import { getTokenValue, useTheme, type SizeTokens } from 'tamagui'
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

type IconProps = Omit<LucideProps, 'size'> & { size?: number | Extract<SizeTokens, `$${string}`> }

// Tamagui consumers still pass symbolic theme colors and size tokens to icons.
function themedIcon(Icon: LucideIcon) {
  return function ThemedIcon({ color, size = 24, ...props }: IconProps) {
    const theme = useTheme()
    const resolvedColor =
      typeof color === 'string' && color.startsWith('$') ? theme[color.slice(1)]?.get('web') : color

    return (
      <Icon
        {...props}
        color={resolvedColor ?? theme.color.get('web')}
        size={typeof size === 'string' ? getTokenValue(size, 'size') : size}
      />
    )
  }
}

export const AlertTriangle = themedIcon(AlertTriangleIcon)
export const ArrowDown = themedIcon(ArrowDownIcon)
export const ArrowRight = themedIcon(ArrowRightIcon)
export const ArrowUp = themedIcon(ArrowUpIcon)
export const BarChart2 = themedIcon(BarChart2Icon)
export const Bell = themedIcon(BellIcon)
export const Calendar = themedIcon(CalendarIcon)
export const Check = themedIcon(CheckIcon)
export const CheckCircle2 = themedIcon(CheckCircle2Icon)
export const ChevronDown = themedIcon(ChevronDownIcon)
export const ChevronLeft = themedIcon(ChevronLeftIcon)
export const ChevronRight = themedIcon(ChevronRightIcon)
export const Clock = themedIcon(ClockIcon)
export const Clock3 = themedIcon(Clock3Icon)
export const Database = themedIcon(DatabaseIcon)
export const Dumbbell = themedIcon(DumbbellIcon)
export const Edit3 = themedIcon(Edit3Icon)
export const Globe2 = themedIcon(Globe2Icon)
export const History = themedIcon(HistoryIcon)
export const Home = themedIcon(HomeIcon)
export const Lock = themedIcon(LockIcon)
export const LogOut = themedIcon(LogOutIcon)
export const MoreHorizontal = themedIcon(MoreHorizontalIcon)
export const Palette = themedIcon(PaletteIcon)
export const Play = themedIcon(PlayIcon)
export const Plus = themedIcon(PlusIcon)
export const Ruler = themedIcon(RulerIcon)
export const ScrollText = themedIcon(ScrollTextIcon)
export const Search = themedIcon(SearchIcon)
export const Settings = themedIcon(SettingsIcon)
export const ShieldCheck = themedIcon(ShieldCheckIcon)
export const Timer = themedIcon(TimerIcon)
export const Trash2 = themedIcon(Trash2Icon)
export const Trophy = themedIcon(TrophyIcon)
export const UserRound = themedIcon(UserRoundIcon)
export const Weight = themedIcon(WeightIcon)
export const X = themedIcon(XIcon)
