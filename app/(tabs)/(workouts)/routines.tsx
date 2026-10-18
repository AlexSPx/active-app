import { RoutineLibraryView } from '../../../features/routines/components/RoutineLibraryView'
import { useRoutineLibrary } from '../../../features/routines/hooks/useRoutineLibrary'

export default function RoutinesTab() {
  return <RoutineLibraryView {...useRoutineLibrary()} />
}
