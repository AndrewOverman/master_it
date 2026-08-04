import type { ConfigContext, ExpoConfig } from 'expo/config';

type Variant = 'development' | 'staging' | 'production';

const VARIANT = (process.env.APP_VARIANT as Variant | undefined) ?? 'production';

const VARIANT_CONFIG: Record<Variant, { name: string; bundleId: string; scheme: string }> = {
  development: {
    name: 'Master It (Dev)',
    bundleId: 'com.masterit.app.dev',
    scheme: 'masterit-dev',
  },
  staging: {
    name: 'Master It (Staging)',
    bundleId: 'com.masterit.app.staging',
    scheme: 'masterit-staging',
  },
  production: {
    name: 'Master It',
    bundleId: 'com.masterit.app',
    scheme: 'masterit',
  },
};

const { name, bundleId, scheme } = VARIANT_CONFIG[VARIANT];

export default (_context: ConfigContext): ExpoConfig => ({
  name,
  slug: 'master-it',
  scheme,
  version: '1.0.0',
  orientation: 'default',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: true,
    bundleIdentifier: bundleId,
  },
  android: {
    package: bundleId,
  },
  plugins: [
    'expo-asset',
    'expo-font',
    '@react-native-community/datetimepicker',
    'expo-secure-store',
    'expo-status-bar',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#ffffff',
      },
    ],
  ],
});
