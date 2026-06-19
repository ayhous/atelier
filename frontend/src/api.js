// En production, VITE_API_URL pointe vers le backend Render
// En dev, vide → le proxy Vite redirige /api/* vers localhost:4000
const API_BASE = import.meta.env.VITE_API_URL || '';

const TOKEN_KEY = 'zone53_token';
const USER_KEY = 'zone53_user';

export function getToken() { return localStorage.getItem(TOKEN_KEY); }
export function getUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; }
}
export function setSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}
export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function request(path, { method = 'GET', body, params } = {}) {
  const url = new URL(API_BASE + path, window.location.origin);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v) url.searchParams.set(k, v);
    }
  }
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  // 401 avec token existant = session expirée -> reload
  // 401 sans token = mauvais identifiants au login -> on laisse l'appelant gérer l'erreur
  if (res.status === 401 && token) {
    clearSession();
    window.location.reload();
    return;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Erreur API');
  return data;
}

export const api = {
  login: (username, password) =>
    request('/api/auth/login', { method: 'POST', body: { username, password } }),
  changePassword: (oldPassword, newPassword) =>
    request('/api/auth/change-password', { method: 'POST', body: { oldPassword, newPassword } }),
  listUsers: () => request('/api/auth/users'),
  getAvatars: () => request('/api/auth/avatars'),
  createUser: (payload) => request('/api/auth/users', { method: 'POST', body: payload }),
  updateUser: (id, payload) =>
    request(`/api/auth/users/${id}`, { method: 'PATCH', body: payload }),
  deleteUser: (id) => request(`/api/auth/users/${id}`, { method: 'DELETE' }),

  listOrders: (params) => request('/api/orders', { params }),
  createOrder: (payload) => request('/api/orders', { method: 'POST', body: payload }),
  updateOrder: (id, payload) =>
    request(`/api/orders/${id}`, { method: 'PATCH', body: payload }),
  orderHistory: (id) => request(`/api/orders/${id}/history`),

  listTodos: () => request('/api/todos'),
  createTodo: (payload) => request('/api/todos', { method: 'POST', body: payload }),
  updateTodo: (id, payload) =>
    request(`/api/todos/${id}`, { method: 'PATCH', body: payload }),
  deleteTodo: (id) => request(`/api/todos/${id}`, { method: 'DELETE' }),
};
