import type { ViewInstance } from 'react-native'
import { useRef, useState } from 'react'
import { Pressable, View } from 'react-native'
import { MoreHorizontal } from './icons'
import { UiText } from './Controls'
import { CadenceOverlay } from './CadenceOverlay'

type MenuAction = {
  label: string
  onPress: () => void
  disabled?: boolean
  destructive?: boolean
}

export function ActionMenu({
  label,
  actions,
  disabled = false,
  onOpen,
}: {
  label: string
  actions: MenuAction[]
  disabled?: boolean
  onOpen?: () => void
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<ViewInstance>(null)
  const pendingAction = useRef<(() => void) | null>(null)
  return (
    <>
      <Pressable
        ref={triggerRef}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded: open, disabled }}
        disabled={disabled}
        className="size-touch items-center justify-center rounded-control active:bg-raised"
        onPress={() => {
          onOpen?.()
          setOpen(true)
        }}
      >
        <MoreHorizontal size={20} />
      </Pressable>
      <CadenceOverlay
        open={open}
        onOpenChange={setOpen}
        title={label}
        returnFocusRef={triggerRef}
        onClosed={() => {
          const action = pendingAction.current
          pendingAction.current = null
          action?.()
        }}
      >
        <View className="gap-compact">
          {actions.map((action) => (
            <Pressable
              key={action.label}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              accessibilityState={{ disabled: !!action.disabled }}
              disabled={action.disabled}
              className={`min-h-action justify-center rounded-control px-field active:bg-raised ${action.disabled ? 'opacity-50' : ''}`}
              onPress={() => {
                pendingAction.current = action.onPress
                setOpen(false)
              }}
            >
              <UiText textRole={action.destructive ? 'captionDestructive' : 'body'}>
                {action.label}
              </UiText>
            </Pressable>
          ))}
        </View>
      </CadenceOverlay>
    </>
  )
}
