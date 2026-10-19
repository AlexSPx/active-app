import { useRouter } from 'expo-router'
import { HistoryScreen, useHistoryController } from '../../../features/history'

export default function HistoryPage() {
  const router = useRouter()
  const history = useHistoryController()

  return (
    <HistoryScreen
      {...history}
      onOpenRecord={(item) =>
        router.push({ pathname: '/(tabs)/(history)/record/[id]', params: { id: item.id } })
      }
    />
  )
}
