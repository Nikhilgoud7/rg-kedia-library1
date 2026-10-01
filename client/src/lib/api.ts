import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true, // Send HttpOnly cookies automatically
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor can be used for other headers if needed,
// but we no longer attach the JWT from localStorage.
api.interceptors.request.use((config) => {
  return config;
});

// Response interceptor to handle 401s
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Clear token on unauthorized if not on login page
      if (window.location.pathname !== '/login') {
        localStorage.removeItem('rg_kedia_token');
        localStorage.removeItem('rg_kedia_user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
