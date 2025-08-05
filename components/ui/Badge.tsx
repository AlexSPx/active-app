import { Text } from 'tamagui'

interface BadgeProps {
  children: string
  variant?: 'primary' | 'secondary' | 'success' | 'warning'
}

export function Badge({ children, variant = 'primary' }: BadgeProps) {
  return (
    <Text
      fontSize="$2"
      color={variant === 'secondary' ? '$secondary' : '$primary'}
      bg="$backgroundHover"
      px="$2"
      py="$1"
      r="$2"
    >
      {children}
    </Text>
  )
}
