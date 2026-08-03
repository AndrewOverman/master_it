import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';

let listenerAttached = false;

// Wires NetInfo into React Query's connectivity signal. Without this,
// onlineManager has no RN-compatible source (it listens for browser
// online/offline events by default) and assumes the app is always
// online, so offline queries would error and retry instead of pausing.
export function setupOnlineManager() {
  if (listenerAttached) return;
  listenerAttached = true;
  onlineManager.setEventListener((setOnline) => {
    return NetInfo.addEventListener((state) => {
      setOnline(Boolean(state.isConnected) && state.isInternetReachable !== false);
    });
  });
}

export function useIsOnline(): boolean {
  const [isOnline, setIsOnline] = useState(() => onlineManager.isOnline());

  useEffect(() => onlineManager.subscribe(() => setIsOnline(onlineManager.isOnline())), []);

  return isOnline;
}

// Blocks an edit while offline with an explicit message, rather than
// letting React Query silently queue the mutation and fire it later —
// offline editing isn't supported yet, so surface that instead of
// pretending the tap worked.
export function useRequireOnline() {
  const isOnline = useIsOnline();

  return function requireOnline(action: string): boolean {
    if (!isOnline) {
      Alert.alert("You're offline", `Connect to the internet to ${action}.`);
      return false;
    }
    return true;
  };
}
