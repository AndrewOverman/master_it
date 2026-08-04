import axios from 'axios';
import { getToken } from '../utils/tokenStorage';

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
