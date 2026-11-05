import { useState } from 'react'
import { TextInput, View } from 'react-native'
import { useCadenceColors } from './useCadenceColors'

export const InputField = ({ icon: Icon, ...props }: any) => {
  const [isFocused, setIsFocused] = useState(false)
  const colors = useCadenceColors()
  const { className = '', onFocus, onBlur, ...inputProps } = props

  return (
    <View
      className={`flex-row items-center rounded-control border bg-raised px-field ${isFocused ? 'border-accent' : 'border-divider'}`}
    >
      {Icon && <Icon size={20} color={colors.muted} />}
      <TextInput
        className={`h-action flex-1 px-field text-body font-dm-regular text-foreground ${className}`}
        placeholderTextColorClassName="accent-muted"
        cursorColorClassName="accent-accent"
        {...inputProps}
        onFocus={(event) => {
          setIsFocused(true)
          onFocus?.(event)
        }}
        onBlur={(event) => {
          setIsFocused(false)
          onBlur?.(event)
        }}
      />
    </View>
  )
}
