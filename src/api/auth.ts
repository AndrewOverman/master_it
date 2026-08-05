import { apiClient } from './client';

export interface AuthUser {
  id: number;
  name: string;
  email: string;
}

export interface AuthResponse {
  user: AuthUser;
  token: string;
}

// POST /api/v1/login
export async function login(payload: { email: string; password: string }): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>('/api/v1/login', payload);
  return data;
}

// POST /api/v1/register
export async function register(payload: {
  name: string;
  email: string;
  password: string;
}): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>('/api/v1/register', payload);
  return data;
}

// POST /api/v1/logout
export async function logout(): Promise<void> {
  await apiClient.post('/api/v1/logout');
}

// POST /api/v1/forgot-password
// Always resolves — the backend gives the same response whether or not the
// email is registered, so there's nothing for a caller to branch on.
export async function forgotPassword(payload: { email: string }): Promise<void> {
  await apiClient.post('/api/v1/forgot-password', payload);
}

// POST /api/v1/reset-password
export async function resetPassword(payload: {
  email: string;
  token: string;
  password: string;
}): Promise<void> {
  await apiClient.post('/api/v1/reset-password', payload);
}

// GET /api/v1/user
export async function getCurrentUser(): Promise<AuthUser> {
  const { data } = await apiClient.get<AuthUser>('/api/v1/user');
  return data;
}

// PATCH /api/v1/user
// current_password is only required when password is included.
export async function updateProfile(payload: {
  name?: string;
  email?: string;
  current_password?: string;
  password?: string;
}): Promise<AuthUser> {
  const { data } = await apiClient.patch<AuthUser>('/api/v1/user', payload);
  return data;
}
