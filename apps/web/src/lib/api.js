export class ApiError extends Error {
  constructor(status, data) {
    super(data.error?.message || 'An API error occurred');
    this.status = status;
    this.code = data.error?.code;
    this.details = data.error?.details;
  }
}

export async function apiFetch(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `/v1${endpoint}`;
  
  const headers = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    'X-Requested-With': 'XMLHttpRequest', // CSRF protection
    ...options.headers,
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errData;
    try {
      errData = await response.json();
    } catch {
      errData = { error: { message: response.statusText } };
    }
    throw new ApiError(response.status, errData);
  }

  // Some endpoints (like logout) might return 204 No Content
  if (response.status === 204) return null;

  return await response.json();
}
