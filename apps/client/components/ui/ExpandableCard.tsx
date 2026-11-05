import { useState, type ReactNode } from 'react'
import { Pressable, View } from 'react-native'
import { ChevronDown, ChevronRight } from './icons'
import { Divider } from './Controls'
import { useCadenceColors } from './useCadenceColors'

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
  const colors = useCadenceColors()

  return (
    <View className="mb-field gap-field rounded-card border border-divider bg-surface p-card">
      <View className="gap-field">
        {/* Header */}
        <Pressable
          onPress={() => setIsExpanded(!isExpanded)}
          accessibilityRole="button"
          accessibilityState={{ expanded: isExpanded }}
          className="flex-row items-center justify-between rounded-control active:bg-raised"
        >
          <View className="min-w-0 flex-1">{header}</View>
          {isExpanded ? (
            <ChevronDown size={20} color={colors.muted} />
          ) : (
            <ChevronRight size={20} color={colors.muted} />
          )}
        </Pressable>

        {/* Stats */}
        {stats}

        {/* Expanded Content */}
        {isExpanded && (
          <View className="mt-compact gap-field">
            <Divider />
            {children}
          </View>
        )}
      </View>
    </View>
  )
}
