import { forwardRef, type ReactNode } from 'react'
import {
  Pressable,
  ActivityIndicator,
  Text,
  TextInput as NativeTextInput,
  View,
  type PressableProps,
  type TextInputProps,
  type TextProps,
  type ViewProps,
} from 'react-native'

export type TextRole =
  | 'screenTitle'
  | 'cardTitle'
  | 'cardTitleMuted'
  | 'body'
  | 'bodyEmphasis'
  | 'bodyMuted'
  | 'caption'
  | 'captionEmphasis'
  | 'captionDestructive'
  | 'bodyOnAccent'

const textClasses: Record<TextRole, string> = {
  screenTitle: 'text-screen-title font-dm-semibold text-foreground',
  cardTitle: 'text-card-title font-dm-semibold text-foreground',
  cardTitleMuted: 'text-card-title font-dm-semibold text-muted',
  body: 'text-body font-dm-regular text-foreground',
  bodyEmphasis: 'text-body font-dm-medium text-foreground',
  bodyMuted: 'text-body font-dm-regular text-muted',
  caption: 'text-caption font-dm-regular text-muted',
  captionEmphasis: 'text-caption font-dm-semibold text-accent',
  captionDestructive: 'text-caption font-dm-regular text-destructive',
  bodyOnAccent: 'text-body font-dm-semibold text-on-accent',
}

// className adds layout and state utilities; use typed variants for visual changes so styling
// never depends on the order of conflicting Tailwind classes.
export function UiText({
  textRole = 'body',
  className = '',
  ...props
}: TextProps & { textRole?: TextRole; className?: string }) {
  return <Text className={`${textClasses[textRole]} ${className}`} {...props} />
}

type ButtonVariant = 'primary' | 'surface' | 'secondary' | 'selected' | 'ghost'
type ButtonShape = 'button' | 'control' | 'card'
type ButtonDensity = 'regular' | 'compact' | 'card'

const buttonClasses: Record<ButtonVariant, string> = {
  primary:
    'min-h-touch bg-accent items-center justify-center active:opacity-80 focus:border-2 focus:border-foreground',
  surface:
    'min-h-touch border border-divider bg-surface items-center justify-center active:bg-raised focus:border-2 focus:border-accent',
  secondary:
    'min-h-touch bg-raised items-center justify-center active:opacity-80 focus:border-2 focus:border-accent',
  selected:
    'min-h-touch border border-accent bg-raised items-center justify-center active:opacity-80 focus:border-2 focus:border-accent',
  ghost:
    'min-h-touch items-center justify-center active:bg-raised focus:border-2 focus:border-accent',
}

const buttonShapeClasses: Record<ButtonShape, string> = {
  button: 'rounded-button',
  control: 'rounded-control',
  card: 'rounded-card',
}

const buttonDensityClasses: Record<ButtonDensity, string> = {
  regular: 'px-field',
  compact: 'px-compact',
  card: 'p-card',
}

export type ButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  children: ReactNode
  variant?: ButtonVariant
  shape?: ButtonShape
  density?: ButtonDensity
  loading?: boolean
  className?: string
}

const buttonTextClasses: Record<ButtonVariant, string> = {
  primary: 'text-body font-dm-medium text-on-accent',
  surface: 'text-body font-dm-medium text-foreground',
  secondary: 'text-body font-dm-medium text-foreground',
  selected: 'text-body font-dm-medium text-foreground',
  ghost: 'text-body font-dm-medium text-foreground',
}

export const Button = forwardRef<View, ButtonProps>(function Button(
  {
    children,
    variant = 'primary',
    shape = 'button',
    density = 'regular',
    loading = false,
    className = '',
    disabled = false,
    accessibilityRole = 'button',
    accessibilityState,
    ...props
  },
  ref
) {
  const isDisabled = disabled || loading
  const content =
    typeof children === 'string' || typeof children === 'number' ? (
      <Text className={buttonTextClasses[variant]}>{children}</Text>
    ) : (
      children
    )

  return (
    <Pressable
      ref={ref}
      {...props}
      className={`${buttonClasses[variant]} ${buttonShapeClasses[shape]} ${buttonDensityClasses[density]} ${isDisabled ? 'opacity-50' : ''} ${className}`}
      disabled={isDisabled}
      accessibilityRole={accessibilityRole}
      accessibilityState={{ ...(accessibilityState ?? {}), busy: loading, disabled: isDisabled }}
    >
      {loading ? (
        <View className="flex-row items-center gap-compact">
          <ActivityIndicator
            size="small"
            colorClassName={variant === 'primary' ? 'accent-on-accent' : 'accent-foreground'}
          />
          {content}
        </View>
      ) : (
        content
      )}
    </Pressable>
  )
})

export type IconButtonProps = Omit<ButtonProps, 'accessibilityLabel'> & {
  accessibilityLabel: string
}

export const IconButton = forwardRef<View, IconButtonProps>(function IconButton(
  { className = '', ...props },
  ref
) {
  return <Button ref={ref} density="compact" className={`min-w-touch ${className}`} {...props} />
})

export function Surface({
  className = '',
  ...props
}: Omit<ViewProps, 'style'> & { className?: string }) {
  return (
    <View
      {...props}
      className={`gap-field rounded-card border border-divider bg-surface p-card ${className}`}
    />
  )
}

export function SettingsGroup({
  title,
  children,
  className = '',
}: {
  title: string
  children: ReactNode
  className?: string
}) {
  return (
    <View className={`gap-compact ${className}`}>
      <UiText accessibilityRole="header" textRole="captionEmphasis" className="px-compact">
        {title}
      </UiText>
      <View className="overflow-hidden rounded-settings border border-divider bg-settings-surface">
        {children}
      </View>
    </View>
  )
}

type SettingsRowProps = Omit<PressableProps, 'children' | 'style'> & {
  title: string
  description: ReactNode
  icon: ReactNode
  trailing?: ReactNode
  className?: string
}

export const SettingsRow = forwardRef<View, SettingsRowProps>(function SettingsRow(
  { title, description, icon, trailing, accessibilityLabel, className = '', ...props },
  ref
) {
  return (
    <Pressable
      ref={ref}
      {...props}
      className={`min-h-touch flex-row items-center justify-between gap-field px-field py-compact active:bg-raised focus:border-2 focus:border-accent ${className}`}
      accessibilityRole="button"
      accessibilityLabel={
        accessibilityLabel ??
        (typeof description === 'string' ? `${title}, ${description}` : undefined)
      }
    >
      <View className="h-touch w-touch items-center justify-center rounded-control bg-raised">
        {icon}
      </View>
      <View className="flex-1 gap-compact">
        <UiText textRole="bodyEmphasis">{title}</UiText>
        {typeof description === 'string' ? (
          <UiText textRole="caption">{description}</UiText>
        ) : (
          description
        )}
      </View>
      {trailing}
    </Pressable>
  )
})

export type SegmentedOption<T extends string> = { value: T; label: string }

export function SegmentedSelection<T extends string>({
  value,
  options,
  onValueChange,
  accessibilityLabel,
  disabled = false,
  className = '',
}: {
  value: T
  options: readonly SegmentedOption<T>[]
  onValueChange: (value: T) => void
  accessibilityLabel: string
  disabled?: boolean
  className?: string
}) {
  return (
    <View
      className={`flex-row gap-compact rounded-control bg-raised p-compact ${className}`}
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
    >
      {options.map((option) => {
        const selected = value === option.value
        return (
          <Button
            key={option.value}
            variant={selected ? 'selected' : 'ghost'}
            className="flex-1"
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ checked: selected }}
            onPress={() => onValueChange(option.value)}
          >
            {option.label}
          </Button>
        )
      })}
    </View>
  )
}

export function TextField({
  className = '',
  disabled = false,
  invalid = false,
  id,
  editable,
  ...props
}: Omit<TextInputProps, 'style'> & {
  className?: string
  disabled?: boolean
  id?: string
  invalid?: boolean
}) {
  return (
    <NativeTextInput
      {...props}
      nativeID={id}
      editable={disabled ? false : editable}
      placeholderTextColorClassName="accent-muted"
      cursorColorClassName="accent-accent"
      className={`h-action rounded-control border ${invalid ? 'border-destructive' : 'border-divider'} bg-raised px-field text-body font-dm-regular text-foreground focus:border-accent ${disabled ? 'opacity-50' : ''} ${className}`}
    />
  )
}

export function UiBadge({
  children,
  variant = 'primary',
  className = '',
}: {
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'success' | 'warning'
  className?: string
}) {
  const secondary = variant === 'secondary'
  const backgroundClass = secondary ? 'bg-raised' : 'bg-accent'
  return (
    <View
      className={`self-start rounded-control px-compact py-compact ${backgroundClass} ${className}`}
    >
      <UiText textRole={secondary ? 'bodyEmphasis' : 'bodyOnAccent'}>{children}</UiText>
    </View>
  )
}

export function Divider({ className = '' }: { className?: string }) {
  return <View accessibilityRole="none" className={`h-px bg-divider ${className}`} />
}
