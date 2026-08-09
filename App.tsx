import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RootNavigator } from './src/navigation/RootNavigator';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { setupOnlineManager } from './src/lib/offline';
import { configurePurchases } from './src/lib/purchases';
import { CACHE_BUSTER, MAX_CACHE_AGE, shouldDehydrateQuery } from './src/lib/queryPersistence';

setupOnlineManager();

// Before any component mounts, because AuthContext's session-restore effect
// identifies the user to RevenueCat and every SDK call throws until
// configure() has run. No-ops when no API key is set — see purchases.ts.
configurePurchases();

const queryClient = new QueryClient();

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
