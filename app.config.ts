import type { ConfigContext, ExpoConfig } from 'expo/config';
// Explicit .ts extension: Expo's config loader transpiles this file
// per-file (via ts.transpileModule) rather than resolving the whole
// project, so it hands Node a plain `require('./src/theme/colors')` —
// and Node's own module resolution won't append `.ts` for an
// extensionless specifier, only for one already spelled out here.
import { lightColors } from './src/theme/colors.ts';

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
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: lightColors.accent,
    },
  },
  extra: {
    eas: {
      projectId: '524638a0-4790-4dba-a379-9d3cd6516708',
    },
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
        backgroundColor: lightColors.background,
      },
    ],
    // Wires the native crash handlers and, at build time, uploads the source
    // maps that turn a minified release stack trace into readable frames.
    // Without the plugin the JS-side SDK still reports, but native crashes —
    // the ones that take the whole app down — go unseen.
    //
    // Left unconfigured here on purpose: the upload needs SENTRY_ORG,
    // SENTRY_PROJECT and SENTRY_AUTH_TOKEN, and the token is a credential that
    // must not sit in the repo. Set all three as EAS build secrets; the plugin
    // reads them from the environment. Without them the build still succeeds
    // and release stack traces are simply unsymbolicated.
    '@sentry/react-native',
    // PostHog reads locale to bucket events by region.
    'expo-localization',
  ],
});
