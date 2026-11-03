import { api } from './api.js';
export const state = { user: null };
export const HOME = { student: '/student/dashboard', faculty: '/faculty/dashboard', hod: '/hod/dashboard', admin: '/admin/dashboard' };
export async function loadUser() { try { state.user = await api('/auth/me'); } catch { state.user = null; } return state.user; }
export async function login(identifier, password, campus) { state.user = await api('/auth/login', { method: 'POST', body: { identifier, password, ...(campus ? { campus } : {}) } }); return state.user; }
export async function logout() { try { await api('/auth/logout', { method: 'POST' }); } catch { /* ignore */ } state.user = null; }
