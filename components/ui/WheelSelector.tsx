import React from 'react'
import { FlatList, View, NativeScrollEvent, NativeSyntheticEvent } from 'react-native'
import { YStack, XStack, Text, useTheme } from 'tamagui'

export interface WheelSelectorProps<T extends number | string> {
  values: T[]
  selected: T | null
  onChange: (value: T | null) => void
  itemHeight?: number
  visibleCount?: number // should be odd for perfect centering
  formatItem?: (value: T) => string
  fadedOpacity?: number
  allowNull?: boolean
  nullLabel?: string
}

export function WheelSelector<T extends number | string>({
  values,
  selected,
  onChange,
  itemHeight = 40,
  visibleCount = 5,
  formatItem = (v) => String(v),
  fadedOpacity = 0.25,
  allowNull = false,
  nullLabel = '-',
}: WheelSelectorProps<T>) {
  const theme = useTheme()

  const listRef = React.useRef<FlatList<T | null>>(null)

  const augmentedValues = React.useMemo<(T | null)[]>(
    () => (allowNull ? [null, ...values] : values),
    [allowNull, values]
  )

  const getNearestIndex = React.useCallback((vals: (T | null)[], sel: T | null) => {
    if (sel === null) return 0
    if (typeof sel === 'number') {
      let bestIdx = 0
      let bestDist = Number.POSITIVE_INFINITY
      for (let i = 0; i < vals.length; i++) {
        const v = vals[i]
        const dist = typeof v === 'number' ? Math.abs(v - sel) : Number.POSITIVE_INFINITY
        if (dist < bestDist) {
          bestDist = dist
          bestIdx = i
        }
      }
      return bestIdx
    }
    const idx = vals.findIndex((v) => v === sel)
    return Math.max(0, idx)
  }, [])

  const selectedIndex = React.useMemo(
    () => getNearestIndex(augmentedValues, selected),
    [augmentedValues, selected, getNearestIndex]
  )

  const containerHeight = itemHeight * visibleCount
  const pad = (containerHeight - itemHeight) / 2

  React.useEffect(() => {
    if (selectedIndex >= 0) {
      listRef.current?.scrollToOffset({ offset: selectedIndex * itemHeight, animated: true })
    }
  }, [selectedIndex, itemHeight])

  const momentumRef = React.useRef(false)
  const handleScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y
    const idx = Math.round(y / itemHeight)
    const clamped = Math.min(augmentedValues.length - 1, Math.max(0, idx))
    const value = augmentedValues[clamped]
    // Avoid tiny numeric flaps when values are numbers
    if (typeof value === 'number' && typeof selected === 'number') {
      if (Math.abs(value - selected) < 1e-6) return
    }
    if (value !== selected) onChange(value as T | null)
  }

  const renderItem = ({ item, index }: { item: T | null; index: number }) => {
    const isSel = index === selectedIndex
    const distance = Math.abs(index - selectedIndex)
    const opacity = isSel ? 1 : Math.max(fadedOpacity, 1 - distance * 0.3)
    return (
      <XStack height={itemHeight} style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Text fontSize={isSel ? '$6' : '$5'} fontWeight={isSel ? '700' : '400'} opacity={opacity}>
          {item === null ? nullLabel : formatItem(item)}
        </Text>
      </XStack>
    )
  }

  return (
    <YStack height={containerHeight} overflow="hidden" position="relative">
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: pad,
          left: 0,
          right: 0,
          height: itemHeight,
          borderTopWidth: 1,
          borderBottomWidth: 1,
          borderColor: theme.borderColor.val,
        }}
      />
      <FlatList
        ref={listRef}
        data={augmentedValues}
        keyExtractor={(v) => (v === null ? 'null' : String(v))}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        snapToInterval={itemHeight}
        decelerationRate="fast"
        onMomentumScrollBegin={() => {
          momentumRef.current = true
        }}
        onMomentumScrollEnd={(e) => {
          momentumRef.current = false
          handleScrollEnd(e)
        }}
        onScrollEndDrag={(e) => {
          // Only finalize selection on drag end if no momentum follows
          if (!momentumRef.current) handleScrollEnd(e)
        }}
        getItemLayout={(_, index) => ({ length: itemHeight, offset: itemHeight * index, index })}
        contentContainerStyle={{ paddingVertical: pad }}
        initialNumToRender={visibleCount + 2}
        windowSize={visibleCount + 6}
      />
    </YStack>
  )
}

export default WheelSelector
