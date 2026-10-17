import { useCSSVariable } from 'uniwind'

const COLOR_VARIABLES: string[] = [
  '--color-background',
  '--color-foreground',
  '--color-muted',
  '--color-divider',
  '--color-accent',
  '--color-on-accent',
] as const

type CadenceHexColor = `#${string}`

export type CadenceColors = {
  background: CadenceHexColor
  foreground: CadenceHexColor
  muted: CadenceHexColor
  divider: CadenceHexColor
  accent: CadenceHexColor
  onAccent: CadenceHexColor
}

/** Read the active Cadence CSS theme for third-party components that need JS colors. */
export function useCadenceColors(): CadenceColors {
  const [background, foreground, muted, divider, accent, onAccent] = useCSSVariable(
    COLOR_VARIABLES
  ) as [
    CadenceHexColor,
    CadenceHexColor,
    CadenceHexColor,
    CadenceHexColor,
    CadenceHexColor,
    CadenceHexColor,
  ]

  return { background, foreground, muted, divider, accent, onAccent }
}
