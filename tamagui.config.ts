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

export const config = createTamagui({
  ...defaultConfig,
  themes: {
    ...defaultConfig.themes,
    dark: fitnessTheme,
    light: fitnessTheme, // Use dark theme for both
  },
  defaultTheme: 'dark',
})

export default config

export type Conf = typeof config

declare module 'tamagui' {
  interface TamaguiCustomConfig extends Conf {}
}
