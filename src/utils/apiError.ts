import axios from 'axios';

// Only 422s get their backend message shown — that's Laravel's own validation
// copy, already scrubbed of anything sensitive (e.g. login never reveals
// whether an email exists). Everything else (5xx, network errors) could leak
// debug info, so those stay generic.
export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (!axios.isAxiosError(error) || !error.response) {
    return "Can't reach the server. Check your connection and try again.";
  }

  const { status, data } = error.response;

  if (status === 429) {
    return 'Too many attempts. Please wait a bit and try again.';
  }

  if (status === 422 && typeof data?.message === 'string') {
    return data.message;
  }

  return fallback;
}
