import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

// Swap for your actual API base URL (env-driven in a real app)
const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.yourapp.com';

export const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: {
    Accept: 'application/json',
  },
});

// Attach the Sanctum token to every request
apiClient.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Basic 401 handling — expand this to trigger a logout/redirect
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // TODO: clear token + redirect to login
    }
    return Promise.reject(error);
  }
);
