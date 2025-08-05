import { useState, ReactNode } from 'react'
import { YStack, XStack, Button, Card, Separator } from 'tamagui'
import { ChevronDown, ChevronRight } from '@tamagui/lucide-icons'

interface ExpandableCardProps {
  header: ReactNode
  stats?: ReactNode
  children: ReactNode
  defaultExpanded?: boolean
}

export function ExpandableCard({
  header,
  stats,
  children,
  defaultExpanded = false,
}: ExpandableCardProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)

  return (
    <Card elevate mb="$3" p="$4" bg="$surface" borderColor="$borderColor">
      <YStack gap="$3">
        {/* Header */}
        <Button unstyled onPress={() => setIsExpanded(!isExpanded)} p="$0" bg="transparent">
          <XStack justify="space-between" items="center" width="100%">
            <YStack flex={1}>{header}</YStack>
            {isExpanded ? (
              <ChevronDown size={20} color="$colorSubtle" />
            ) : (
              <ChevronRight size={20} color="$colorSubtle" />
            )}
          </XStack>
        </Button>

        {/* Stats */}
        {stats && stats}

        {/* Expanded Content */}
        {isExpanded && (
          <YStack gap="$3" mt="$2">
            <Separator />
            {children}
          </YStack>
        )}
      </YStack>
    </Card>
  )
}
