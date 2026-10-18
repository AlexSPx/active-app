import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import {
  AccessibilityInfo,
  Animated,
  findNodeHandle,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  Text,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
  type PanResponderGestureState,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

type CadenceOverlayProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
  title?: string
  dismissible?: boolean
  snapPoints?: readonly number[]
  position?: number
  onPositionChange?: (position: number) => void
  onClosed?: () => void
  returnFocusRef?: RefObject<View | null>
}

const CLOSE_DISTANCE = 48
const CLOSE_VELOCITY = 0.6

export function CadenceOverlay({
  open,
  onOpenChange,
  children,
  title,
  dismissible = true,
  snapPoints,
  position,
  onPositionChange,
  onClosed,
  returnFocusRef,
}: CadenceOverlayProps) {
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()
  const [availableHeight, setAvailableHeight] = useState(height)
  const points = snapPoints?.length ? snapPoints : undefined
  const [localPosition, setLocalPosition] = useState(0)
  const requestedPosition = position ?? localPosition
  const activePosition =
    points && Number.isFinite(requestedPosition)
      ? Math.round(Math.max(0, Math.min(points.length - 1, requestedPosition)))
      : 0
  const maxPoint = points?.[0] ?? 90
  const activePoint = points?.[activePosition] ?? maxPoint
  const [mounted, setMounted] = useState(open)
  const translateY = useRef(new Animated.Value(open ? 0 : height)).current
  const opacity = useRef(new Animated.Value(open ? 1 : 0)).current
  const titleRef = useRef<Text>(null)
  const handleRef = useRef<View>(null)
  const dragStart = useRef(0)
  const current = useRef({
    open,
    dismissible,
    points,
    position: activePosition,
    onOpenChange,
    onPositionChange,
    onClosed,
    returnFocusRef,
  })
  current.current = {
    open,
    dismissible,
    points,
    position: activePosition,
    onOpenChange,
    onPositionChange,
    onClosed,
    returnFocusRef,
  }

  const focus = (ref: RefObject<View | Text | null>) => {
    const tag = findNodeHandle(ref.current)
    if (tag !== null) AccessibilityInfo.setAccessibilityFocus(tag)
  }

  const requestClose = () => {
    if (!current.current.dismissible) return
    Keyboard.dismiss()
    current.current.onOpenChange(false)
  }

  const setPosition = (next: number) => {
    setLocalPosition(next)
    current.current.onPositionChange?.(next)
  }

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (
          _event: GestureResponderEvent,
          gesture: PanResponderGestureState
        ) => Math.abs(gesture.dy) > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderGrant: () => {
          translateY.stopAnimation((value) => {
            dragStart.current = Math.max(0, value)
          })
        },
        onPanResponderMove: (_event, gesture) => {
          translateY.setValue(Math.max(0, dragStart.current + gesture.dy))
        },
        onPanResponderRelease: (_event, gesture) => {
          const { dismissible: canDismiss, points: detents, position: index } = current.current
          const movedDown = gesture.dy > CLOSE_DISTANCE || gesture.vy > CLOSE_VELOCITY
          const movedUp = gesture.dy < -CLOSE_DISTANCE || gesture.vy < -CLOSE_VELOCITY

          if (movedDown && detents && index < detents.length - 1) {
            setPosition(index + 1)
            Animated.spring(translateY, {
              toValue: 0,
              damping: 24,
              stiffness: 220,
              mass: 0.8,
              useNativeDriver: true,
            }).start()
            return
          }
          if (movedUp && detents && index > 0) {
            setPosition(index - 1)
            Animated.spring(translateY, {
              toValue: 0,
              damping: 24,
              stiffness: 220,
              mass: 0.8,
              useNativeDriver: true,
            }).start()
            return
          }
          if (movedDown && canDismiss) {
            requestClose()
            return
          }
          Animated.spring(translateY, {
            toValue: 0,
            damping: 24,
            stiffness: 220,
            mass: 0.8,
            useNativeDriver: true,
          }).start()
        },
        onPanResponderTerminate: () => {
          Animated.spring(translateY, {
            toValue: 0,
            damping: 24,
            stiffness: 220,
            mass: 0.8,
            useNativeDriver: true,
          }).start()
        },
      }),
    [translateY]
  )

  useEffect(() => {
    let effectIsActive = true

    if (open) {
      setMounted(true)
      translateY.stopAnimation()
      opacity.stopAnimation()
      translateY.setValue(height)
      opacity.setValue(0)
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (!finished || !effectIsActive) return
        focus(titleRef.current ? titleRef : handleRef)
      })
    } else if (mounted) {
      Keyboard.dismiss()
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: height,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, { toValue: 0, duration: 160, useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (!finished || !effectIsActive || current.current.open) return
        setMounted(false)
        requestAnimationFrame(() => {
          if (!effectIsActive || current.current.open) return
          if (current.current.returnFocusRef) focus(current.current.returnFocusRef)
          current.current.onClosed?.()
        })
      })
    }

    return () => {
      effectIsActive = false
      translateY.stopAnimation()
      opacity.stopAnimation()
    }
  }, [open])

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={requestClose}
    >
      <KeyboardAvoidingView
        className="flex-1 justify-end"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View
          className="flex-1 justify-end"
          onLayout={(event) => {
            const nextHeight = event.nativeEvent.layout.height
            setAvailableHeight((previous) =>
              Math.abs(previous - nextHeight) > 1 ? nextHeight : previous
            )
          }}
        >
          <Animated.View className="absolute inset-0" style={{ opacity }}>
            <Pressable
              className="flex-1 bg-black/50"
              accessibilityRole={dismissible ? 'button' : undefined}
              accessibilityLabel={dismissible ? `Dismiss ${title ?? 'sheet'}` : undefined}
              onPress={requestClose}
              disabled={!dismissible}
            />
          </Animated.View>
          <Animated.View
            className="rounded-t-3xl border-t border-divider bg-surface"
            style={{
              height: points ? (availableHeight * activePoint) / 100 : undefined,
              maxHeight: points ? undefined : availableHeight * 0.9,
              transform: [{ translateY }],
            }}
            accessibilityViewIsModal
            importantForAccessibility="yes"
          >
            <View {...panResponder.panHandlers}>
              <Pressable
                ref={handleRef}
                className="h-touch items-center justify-center"
                accessibilityRole={dismissible ? 'button' : undefined}
                accessibilityLabel={dismissible ? `Dismiss ${title ?? 'sheet'}` : undefined}
                accessibilityState={{ expanded: open }}
                onPress={requestClose}
                disabled={!dismissible}
              >
                <View className="h-1 w-10 rounded-full bg-muted" />
              </Pressable>
            </View>
            <View
              className={`px-page ${points ? 'flex-1' : ''}`}
              style={{
                paddingBottom: insets.bottom + 20,
                paddingTop: activePoint === 100 ? insets.top : 0,
              }}
            >
              {title && (
                <Text
                  ref={titleRef}
                  accessibilityRole="header"
                  className="mb-field text-header font-dm-semibold text-foreground"
                >
                  {title}
                </Text>
              )}
              <View className={points ? 'flex-1 gap-field' : 'gap-field'}>{children}</View>
            </View>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}
