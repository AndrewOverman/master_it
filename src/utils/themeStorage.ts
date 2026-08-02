import * as SecureStore from 'expo-secure-store';

const THEME_KEY = 'theme_preference';

export async function getStoredThemePreference(): Promise<string | null> {
  return SecureStore.getItemAsync(THEME_KEY);
}

export async function setStoredThemePreference(preference: string): Promise<void> {
  await SecureStore.setItemAsync(THEME_KEY, preference);
}
