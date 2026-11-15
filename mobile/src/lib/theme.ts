import { useColorScheme } from 'react-native';

const palette = {
  green900: '#14351F',
  green700: '#1F5130',
  green500: '#2F7A47',
  green100: '#E3F0E6',
  amber500: '#E8A317', // color crotal: acción principal (cámara)
  amber100: '#FDF1D6',
  red500: '#C0392B',
  red100: '#FBE4E1',
  blue500: '#2667B5',
  blue100: '#E2ECF8',
};

export interface Theme {
  dark: boolean;
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  primary: string;
  onPrimary: string;
  accent: string;
  onAccent: string;
  danger: string;
  dangerBg: string;
  success: string;
  successBg: string;
  warning: string;
  warningBg: string;
  info: string;
  infoBg: string;
}

export const lightTheme: Theme = {
  dark: false,
  bg: '#F5F5F0',
  surface: '#FFFFFF',
  surfaceAlt: '#EEEEE8',
  border: '#DADAD2',
  text: '#1B1D1A',
  textMuted: '#5E625B',
  primary: palette.green700,
  onPrimary: '#FFFFFF',
  accent: palette.amber500,
  onAccent: '#1B1D1A',
  danger: palette.red500,
  dangerBg: palette.red100,
  success: palette.green500,
  successBg: palette.green100,
  warning: '#9A6A00',
  warningBg: palette.amber100,
  info: palette.blue500,
  infoBg: palette.blue100,
};

export const darkTheme: Theme = {
  dark: true,
  bg: '#0F120F',
  surface: '#1A1E1A',
  surfaceAlt: '#232823',
  border: '#343A34',
  text: '#EEF0EC',
  textMuted: '#A3A9A1',
  primary: '#5DB57A',
  onPrimary: '#0F120F',
  accent: '#F2B636',
  onAccent: '#1B1D1A',
  danger: '#EF6F61',
  dangerBg: '#3A1F1C',
  success: '#5DB57A',
  successBg: '#1C3324',
  warning: '#F2B636',
  warningBg: '#3A2F14',
  info: '#79A9E6',
  infoBg: '#1B2A3D',
};

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? darkTheme : lightTheme;
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 18, pill: 999 } as const;
/** Tamaño mínimo de objetivo táctil (guantes, manos mojadas): mayor que los 44 pt de las guías. */
export const TOUCH = 56;
export const font = { sm: 14, md: 16, lg: 18, xl: 22, xxl: 28 } as const;
