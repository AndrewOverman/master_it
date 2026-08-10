import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RootNavigator } from './src/navigation/RootNavigator';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { setupOnlineManager } from './src/lib/offline';
import { configurePurchases } from './src/lib/purchases';
import { configureAnalytics } from './src/lib/analytics';
import { configureErrorReporting } from './src/lib/errorReporting';
import { configurePushNotifications } from './src/lib/pushNotifications';
import { queryClient } from './src/lib/queryClient';
import { CACHE_BUSTER, MAX_CACHE_AGE, shouldDehydrateQuery } from './src/lib/queryPersistence';

setupOnlineManager();

// First, so an error thrown by anything below is itself reported.
configureErrorReporting();
configureAnalytics();

// Before any component mounts, because AuthContext's session-restore effect
// identifies the user to RevenueCat and every SDK call throws until
// configure() has run. No-ops when no API key is set — see purchases.ts.
configurePurchases();

// Sets the foreground presentation rules and registers the notification
// categories the action buttons hang off. Must run before any notification
// can arrive, which means module scope — a category registered later than
// the notification referencing it shows no buttons.
configurePushNotifications();

const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'master-it-query-cache',
});

function AppStatusBar() {
  const { colorScheme } = useTheme();
  return <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ThemeProvider>
          <PersistQueryClientProvider
            client={queryClient}
            persistOptions={{
              persister,
              maxAge: MAX_CACHE_AGE,
              buster: CACHE_BUSTER,
              dehydrateOptions: { shouldDehydrateQuery },
            }}
          >
            <AppStatusBar />
            <RootNavigator />
          </PersistQueryClientProvider>
        </ThemeProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
