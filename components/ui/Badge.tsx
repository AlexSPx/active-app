import type { ReactNode } from 'react'
import { UiBadge } from './Controls'

interface BadgeProps {
  children: string
  variant?: 'primary' | 'secondary' | 'pill' | 'success' | 'warning'
  icon?: ReactNode
  className?: string
}

export function Badge({ children, variant = 'primary', icon, className }: BadgeProps) {
  return (
    <UiBadge variant={variant} icon={icon} className={className}>
      {children}
    </UiBadge>
  )
}
