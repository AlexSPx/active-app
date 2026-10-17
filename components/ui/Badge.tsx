import { UiBadge } from './Controls'

interface BadgeProps {
  children: string
  variant?: 'primary' | 'secondary' | 'success' | 'warning'
  className?: string
}

export function Badge({ children, variant = 'primary', className }: BadgeProps) {
  return (
    <UiBadge variant={variant} className={className}>
      {children}
    </UiBadge>
  )
}
