import { defaultConfig } from '@tamagui/config/v4'
import { createFont, createTamagui, createTokens } from 'tamagui'

// Semantic roles from docs/design-previews/workouts-routines/DESIGN.md.
const fitnessTheme = {
  // Background colors
  background: '#0F141B',
  backgroundHover: '#202A36',
  backgroundPress: '#20242C',
  backgroundFocus: '#202A36',
  backgroundStrong: '#202A36',
  backgroundTransparent: 'transparent',

  // Surface colors (cards, panels)
  surface: '#171E27',
  surfaceHover: '#1A1E26',
  surfacePress: '#202630',
  surfaceFocus: '#1A1E26',

  // Accent colors
  backgroundAccent: '#1A3051',
  backgroundAccentHover: '#162340',
  backgroundAccentPress: '#1B2A4C',
  backgroundAccentFocus: '#162340',

  // Text colors
  color: '#E8EDF4',
  colorHover: '#E8EDF4',
  colorPress: '#E8EDF4',
  colorFocus: '#E8EDF4',
  colorTransparent: 'transparent',
  colorSubtle: '#A3ADBC',
  colorMuted: '#8894A5',

  // Border colors
  borderColor: '#2A3544',
  borderColorHover: '#343B47',
  borderColorPress: '#343B47',
  borderColorFocus: '#4D8DFF',
  borderAccent: '#4D8DFF',

  // Interactive colors
  placeholderColor: '#A0A7B4',

  // Primary theme (Fitness Blue)
  primary: '#4D8DFF',
  primaryHover: '#6BA0FF',
  primaryPress: '#2F6FED',
  primaryFocus: '#6BA0FF',
  onPrimary: '#0F141B',
  trainingMuted: '#739BE8',
  onTrainingMuted: '#0F141B',
  destructive: '#FF6B7A',

  // Secondary theme (Orange/Amber)
  secondary: '#FFB24D',
  secondaryHover: '#FFC06B',
  secondaryPress: '#D98212',
  secondaryFocus: '#FFC06B',
  onSecondary: '#FFFFFF',

  // Success theme (Green)
  success: '#34C759',
  successHover: '#4AD769',
  successPress: '#248A3D',
  successFocus: '#4AD769',
  onSuccess: '#FFFFFF',

  // Legacy color scale (for compatibility)
  color1: '#0B0D10',
  color2: '#11141A',
  color3: '#202A36',
  color4: '#20242C',
  color5: '#282E38',
  color6: '#343B47',
  color7: '#747C89',
  color8: '#A0A7B4',
  color9: '#C4CAD3',
  color10: '#A0A7B4',
  color11: '#E8EDF4',
  color12: '#FFFFFF',

  // Themed color scales
  red1: '#0A0A0A',
  red2: '#1A0606',
  red3: '#2A0D0D',
  red4: '#3A1313',
  red5: '#4A1A1A',
  red6: '#5A2020',
  red7: '#6A2727',
  red8: '#D70015',
  red9: '#FF3B30',
  red10: '#FF453A',
  red11: '#FF6B60',
  red12: '#FFFFFF',

  blue1: '#0A0A0A',
  blue2: '#06091A',
  blue3: '#0D132A',
  blue4: '#131C3A',
  blue5: '#1A264A',
  blue6: '#20305A',
  blue7: '#273A6A',
  blue8: '#0056CC',
  blue9: '#007AFF',
  blue10: '#1A8FFF',
  blue11: '#3A9FFF',
  blue12: '#FFFFFF',

  green1: '#0A0A0A',
  green2: '#061A0A',
  green3: '#0D2A14',
  green4: '#133A1D',
  green5: '#1A4A27',
  green6: '#205A30',
  green7: '#276A3A',
  green8: '#248A3D',
  green9: '#34C759',
  green10: '#4AD769',
  green11: '#5AE779',
  green12: '#FFFFFF',
}

const lightTheme = {
  ...fitnessTheme,
  // Background colors
  background: '#FBFCFE',
  backgroundHover: '#F4F6FA',
  backgroundPress: '#E9EDF4',
  backgroundFocus: '#F4F6FA',
  backgroundStrong: '#F4F6FA',
  backgroundTransparent: 'transparent',

  // Surface colors
  surface: '#FFFFFF',
  surfaceHover: '#F6F8FB',
  surfacePress: '#EEF2F7',
  surfaceFocus: '#F6F8FB',

  // Accent colors
  backgroundAccent: '#EEF5FF',
  backgroundAccentHover: '#E3EFFF',
  backgroundAccentPress: '#D7E8FF',
  backgroundAccentFocus: '#E3EFFF',

  // Text colors
  color: '#202531',
  colorHover: '#202531',
  colorPress: '#202531',
  colorFocus: '#202531',
  colorSubtle: '#6F7785',
  colorMuted: '#98A1AF',

  // Border colors
  borderColor: '#E5EAF1',
  borderColorHover: '#D7DEE8',
  borderColorPress: '#CAD3E0',
  borderColorFocus: '#2F6FED',
  borderAccent: '#2F6FED',

  // Primary theme (Fitness Blue)
  primary: '#2F6FED',
  primaryHover: '#245FDB',
  primaryPress: '#1B4CAD',
  primaryFocus: '#245FDB',
  onPrimary: '#FFFFFF',
  destructive: '#D70015',
  onTrainingMuted: '#202531',

  // Secondary theme (Orange/Amber)
  secondary: '#FF9500',
  secondaryHover: '#E68600',
  secondaryPress: '#CC7700',
  secondaryFocus: '#E68600',
  onSecondary: '#FFFFFF',

  // Success theme (Green)
  success: '#34C759',
  successHover: '#2DA84E',
  successPress: '#248A3D',
  successFocus: '#2DA84E',
  onSuccess: '#FFFFFF',

  // Legacy color scale (inverted for light)
  color1: '#FFFFFF',
  color2: '#FBFCFE',
  color3: '#F4F6FA',
  color4: '#E9EDF4',
  color5: '#D7DEE8',
  color6: '#CAD3E0',
  color7: '#98A1AF',
  color8: '#6F7785',
  color9: '#4D5664',
  color10: '#3A4250',
  color11: '#202531',
  color12: '#111827',
  // Themed color scales (Light Mode)
  red1: '#FFFFFF',
  red2: '#FFF5F5',
  red3: '#FFE0E0',
  red4: '#FFC7C7',
  red5: '#FFADAD',
  red6: '#FF9494',
  red7: '#FF7A7A',
  red8: '#FF6161',
  red9: '#FF4747',
  red10: '#FF2E2E',
  red11: '#E60000',
  red12: '#1A0505',

  blue1: '#FFFFFF',
  blue2: '#F0F7FF',
  blue3: '#E0EFFF',
  blue4: '#C7E0FF',
  blue5: '#ADD2FF',
  blue6: '#94C3FF',
  blue7: '#7AB5FF',
  blue8: '#61A6FF',
  blue9: '#2F6FED',
  blue10: '#245FDB',
  blue11: '#1B4CAD',
  blue12: '#05101A',

  green1: '#FFFFFF',
  green2: '#F2FFF5',
  green3: '#E0FFE7',
  green4: '#C7FFD4',
  green5: '#ADFFC2',
  green6: '#94FFAF',
  green7: '#7AFF9D',
  green8: '#61FF8A',
  green9: '#34C759',
  green10: '#2DA84E',
  green11: '#248A3D',
  green12: '#051A0A',
}

import { createAnimations } from '@tamagui/animations-react-native'

const animations = createAnimations({
  fast: {
    type: 'timing',
    duration: 100,
  },
  quick: {
    type: 'timing',
    duration: 200,
  },
  medium: {
    type: 'timing',
    duration: 350,
  },
  slow: {
    type: 'spring',
    damping: 20,
    stiffness: 60,
  },
  bouncy: {
    type: 'spring',
    damping: 10,
    mass: 0.9,
    stiffness: 100,
  },
})

// Keep the default scales for existing screens; previews use these named roles.
const tokens = createTokens({
  ...defaultConfig.tokens,
  radius: {
    ...defaultConfig.tokens.radius,
    card: 20,
    menu: 16,
    button: 14,
    control: 12,
    day: 10,
    badge: 8,
    block: 6,
    sheet: 24,
  },
  space: {
    ...defaultConfig.tokens.space,
    page: 20,
    card: 16,
    section: 24,
    field: 12,
    compact: 4,
  },
  size: {
    ...defaultConfig.tokens.size,
    content: 720,
    touch: 44,
    action: 48,
    setRow: 32,
    day: 96,
    icon: 18,
    iconSmall: 16,
    muscleDiagram: 144,
  },
})

const bodyFont = createFont({
  ...defaultConfig.fonts.body,
  size: {
    ...defaultConfig.fonts.body.size,
    screenTitle: 24,
    cardTitle: 20,
    sectionTitle: 21,
    exerciseTitle: 15,
    metric: 29,
    body: 14,
    caption: 12,
    header: 18,
    boardLabel: 11,
  },
  lineHeight: {
    ...defaultConfig.fonts.body.lineHeight,
    screenTitle: 32,
    cardTitle: 26,
    sectionTitle: 28,
    exerciseTitle: 22,
    metric: 36,
    body: 22,
    caption: 20,
    header: 26,
    boardLabel: 14,
  },
  weight: {
    ...defaultConfig.fonts.body.weight,
    screenTitle: '600',
    cardTitle: '600',
    sectionTitle: '600',
    exerciseTitle: '600',
    metric: '600',
    body: '400',
    caption: '400',
    header: '700',
    boardLabel: '600',
  },
})

export const config = createTamagui({
  ...defaultConfig,
  animations,
  tokens,
  fonts: { ...defaultConfig.fonts, body: bodyFont },
  themes: {
    ...defaultConfig.themes,
    dark: fitnessTheme,
    light: lightTheme,
  },
  defaultTheme: 'dark',
})

export default config

export type Conf = typeof config

declare module 'tamagui' {
  interface TamaguiCustomConfig extends Conf {}
}
