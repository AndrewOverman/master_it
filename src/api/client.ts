import axios from 'axios';
import { getToken } from '../utils/tokenStorage';
import { notifySessionExpired } from './sessionEvents';

// Set per environment: locally via root .env, in EAS builds via eas.json build profiles.
const BASE_URL = process.env.EXPO_PUBLIC_API_URL;

export const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: {
    Accept: 'application/json',
  },
});

// Attach the Sanctum token to every request
apiClient.interceptors.request.use(async (config) => {
  const token = await getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// A 401 here always means an expired/revoked Sanctum token — login and
// register aren't behind auth:sanctum, so bad credentials fail with 422
// instead, never 401. Force the app back to the login screen rather than
// leaving every subsequent request to fail silently against a dead token.
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      notifySessionExpired();
    }
    return Promise.reject(error);
  }
);
