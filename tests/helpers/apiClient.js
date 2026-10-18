// tests/helpers/apiClient.js — Authenticated HTTP Client & Secret Leak Detector
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

export const FORBIDDEN_SECRET_KEYS = [
  'password',
  'passwordhash',
  'tokenversion',
  'failedloginattempts',
  'lockeduntil',
];

/**
 * Recursively scans a response object/array to verify no sensitive credentials or security counters are leaked.
 * Returns an array of detected leaked key paths.
 */
export function findLeakedSecrets(data, currentPath = '') {
  const leaks = [];
  if (!data || typeof data !== 'object') {
    return leaks;
  }

  if (Array.isArray(data)) {
    data.forEach((item, index) => {
      leaks.push(...findLeakedSecrets(item, `${currentPath}[${index}]`));
    });
    return leaks;
  }

  for (const [key, value] of Object.entries(data)) {
    const fullPath = currentPath ? `${currentPath}.${key}` : key;
    if (FORBIDDEN_SECRET_KEYS.includes(key.toLowerCase())) {
      leaks.push(fullPath);
    }
    if (value && typeof value === 'object') {
      leaks.push(...findLeakedSecrets(value, fullPath));
    }
  }

  return leaks;
}

/**
 * Creates an isolated API client instance bound to a target baseUrl.
 */
export function createApiClient(baseUrl) {
  let cookieHeader = '';

  const setCookie = (cookie) => {
    cookieHeader = cookie || '';
  };

  const getCookie = () => cookieHeader;

  const request = async (method, path, { cookie = cookieHeader, body = undefined, headers = {} } = {}) => {
    const reqHeaders = { ...headers };
    if (cookie) {
      reqHeaders['Cookie'] = cookie;
    }
    const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
    if (body !== undefined && !isFormData && !reqHeaders['Content-Type']) {
      reqHeaders['Content-Type'] = 'application/json';
    }

    const url = `${baseUrl}${path}`;
    const res = await fetch(url, {
      method,
      headers: reqHeaders,
      body: body !== undefined ? (typeof body === 'string' || isFormData ? body : JSON.stringify(body)) : undefined,
    });

    // Check for Set-Cookie header
    const setCookieHeaders = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    const tokenCookie = setCookieHeaders.find((c) => c.startsWith('rg_kedia_token='));
    const newCookie = tokenCookie ? tokenCookie.split(';')[0] : '';

    let data = null;
    const text = await res.text();
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    return {
      status: res.status,
      headers: res.headers,
      data,
      body: data,
      cookie: newCookie || cookie,
    };
  };

  const login = async (email, password) => {
    const res = await request('POST', '/api/auth/login', {
      body: { email, password },
    });
    if (res.status === 200 && res.cookie) {
      cookieHeader = res.cookie;
    }
    return res;
  };

  const loginAs = (user) => {
    const token = jwt.sign(
      { id: user.id, v: user.tokenVersion ?? 0 },
      process.env.JWT_SECRET || 'fallback-secret-value-for-tests-32chars',
      { expiresIn: '7d' }
    );
    cookieHeader = `rg_kedia_token=${token}`;
    return cookieHeader;
  };

  return {
    request,
    login,
    loginAs,
    setCookie,
    getCookie,
  };
}
