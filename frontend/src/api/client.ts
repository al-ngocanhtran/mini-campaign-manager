import { store } from "../store";

const BASE = "";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = store.getState().auth.token;

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

// Auth
export const register = (data: { email: string; name: string; password: string }) =>
  request<{ user: User; token: string }>("/auth/register", {
    method: "POST",
    body: JSON.stringify(data),
  });

export const login = (data: { email: string; password: string }) =>
  request<{ user: User; token: string }>("/auth/login", {
    method: "POST",
    body: JSON.stringify(data),
  });

// Campaigns
export const getCampaigns = (page = 1, limit = 10) =>
  request<{ campaigns: Campaign[]; total: number; page: number; limit: number }>(
    `/campaigns?page=${page}&limit=${limit}`
  );

export const getCampaign = (id: number) =>
  request<CampaignDetail>(`/campaigns/${id}`);

export const createCampaign = (data: {
  name: string;
  subject: string;
  body: string;
  recipientEmails: string[];
}) =>
  request<Campaign>("/campaigns", { method: "POST", body: JSON.stringify(data) });

export const updateCampaign = (id: number, data: { name?: string; subject?: string; body?: string }) =>
  request<Campaign>(`/campaigns/${id}`, { method: "PATCH", body: JSON.stringify(data) });

export const deleteCampaign = (id: number) =>
  request<void>(`/campaigns/${id}`, { method: "DELETE" });

export const scheduleCampaign = (id: number, scheduled_at: string) =>
  request<Campaign>(`/campaigns/${id}/schedule`, {
    method: "POST",
    body: JSON.stringify({ scheduled_at }),
  });

export const sendCampaign = (id: number) =>
  request<Campaign>(`/campaigns/${id}/send`, { method: "POST" });

export const getCampaignStats = (id: number) =>
  request<CampaignStats>(`/campaigns/${id}/stats`);

// Types
export interface User {
  id: number;
  email: string;
  name: string;
  created_at: string;
}

export interface Campaign {
  id: number;
  name: string;
  subject: string;
  body: string;
  status: "draft" | "scheduled" | "sent";
  scheduled_at: string | null;
  created_by: number;
  created_at: string;
  updated_at: string;
  recipient_count?: number;
}

export interface Recipient {
  id: number;
  email: string;
  name: string;
  status: "pending" | "sent" | "failed";
  sent_at: string | null;
  opened_at: string | null;
}

export interface CampaignDetail extends Campaign {
  recipients: Recipient[];
}

export interface CampaignStats {
  total: number;
  sent: number;
  failed: number;
  opened: number;
  open_rate: number;
  send_rate: number;
}
