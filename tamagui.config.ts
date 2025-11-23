import { defaultConfig } from '@tamagui/config/v4'
import { createTamagui } from 'tamagui'

// Semantic fitness theme with cohesive naming
const fitnessTheme = {
  // Background colors
  background: '#0A0A0A',
  backgroundHover: '#1A1A1A',
  backgroundPress: '#1A1A1A',
  backgroundFocus: '#1A1A1A',
  backgroundStrong: '#1A1A1A',
  backgroundTransparent: 'transparent',

  // Surface colors (cards, panels)
  surface: '#1A1A1A',
  surfaceHover: '#2C2C2E',
  surfacePress: '#2C2C2E',
  surfaceFocus: '#2C2C2E',

  // Accent colors
  backgroundAccent: '#0D132A', // Dark blue background
  backgroundAccentHover: '#131C3A',
  backgroundAccentPress: '#131C3A',
  backgroundAccentFocus: '#131C3A',

  // Text colors
  color: '#FFFFFF',
  colorHover: '#FFFFFF',
  colorPress: '#FFFFFF',
  colorFocus: '#FFFFFF',
  colorTransparent: 'transparent',
  colorSubtle: '#8E8E93',
  colorMuted: '#636366',

  // Border colors
  borderColor: '#2A2A2A',
  borderColorHover: '#3A3A3C',
  borderColorPress: '#3A3A3C',
  borderColorFocus: '#007AFF',
  borderAccent: '#007AFF',

  // Interactive colors
  placeholderColor: '#8E8E93',

  // Primary theme (Fitness Blue)
  primary: '#007AFF',
  primaryHover: '#1A8FFF',
  primaryPress: '#0056CC',
  primaryFocus: '#1A8FFF',
  onPrimary: '#FFFFFF',

  // Secondary theme (Orange/Amber)
  secondary: '#FF9500',
  secondaryHover: '#FFAD33',
  secondaryPress: '#CC7700',
  secondaryFocus: '#FFAD33',
  onSecondary: '#FFFFFF',

  // Success theme (Green)
  success: '#34C759',
  successHover: '#4AD769',
  successPress: '#248A3D',
  successFocus: '#4AD769',
  onSuccess: '#FFFFFF',

  // Legacy color scale (for compatibility)
  color1: '#0A0A0A',
  color2: '#1A1A1A',
  color3: '#2C2C2E',
  color4: '#3A3A3C',
  color5: '#48484A',
  color6: '#636366',
  color7: '#8E8E93',
  color8: '#AEAEB2',
  color9: '#C7C7CC',
  color10: '#8E8E93',
  color11: '#FFFFFF',
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
  background: '#FFFFFF',
  backgroundHover: '#F2F2F7',
  backgroundPress: '#E5E5EA',
  backgroundFocus: '#F2F2F7',
  backgroundStrong: '#F2F2F7',
  backgroundTransparent: 'transparent',

  // Surface colors
  surface: '#f6f6f6ff',
  surfaceHover: '#F2F2F7',
  surfacePress: '#E5E5EA',
  surfaceFocus: '#F2F2F7',

  // Accent colors
  backgroundAccent: '#E1F0FF', // Light blue background
  backgroundAccentHover: '#D0E6FF',
  backgroundAccentPress: '#C0DCFF',
  backgroundAccentFocus: '#D0E6FF',

  // Text colors
  color: '#000000',
  colorHover: '#000000',
  colorPress: '#000000',
  colorFocus: '#000000',
  colorSubtle: '#8E8E93',
  colorMuted: '#AEAEB2',

  // Border colors
  borderColor: '#e1e1e1ff',
  borderColorHover: '#D1D1D6',
  borderColorPress: '#C7C7CC',
  borderColorFocus: '#007AFF',
  borderAccent: '#007AFF',

  // Primary theme (Fitness Blue) - keep similar but adjust for light mode if needed
  primary: '#007AFF',
  primaryHover: '#0062CC',
  primaryPress: '#004999',
  primaryFocus: '#0062CC',
  onPrimary: '#FFFFFF',

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
  color2: '#F2F2F7',
  color3: '#E5E5EA',
  color4: '#D1D1D6',
  color5: '#C7C7CC',
  color6: '#AEAEB2',
  color7: '#8E8E93',
  color8: '#636366',
  color9: '#48484A',
  color10: '#3A3A3C',
  color11: '#1C1C1E',
  color12: '#000000',
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
  blue9: '#007AFF',
  blue10: '#0062CC',
  blue11: '#004999',
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

export const config = createTamagui({
  ...defaultConfig,
  animations,
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
