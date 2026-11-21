import type { Item, ItemInput, ItemStatus, Meta, SyncResult, SyncStatus } from './types';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

export interface SaveResponse {
  item: Item;
  synced: boolean;
}

export const api = {
  list: (status: ItemStatus | 'all' = 'active') => request<Item[]>(`/api/items?status=${status}`),
  get: (id: string) => request<Item>(`/api/items/${id}`),
  meta: () => request<Meta>('/api/meta'),
  create: (input: ItemInput) => request<SaveResponse>('/api/items', json('POST', input)),
  update: (id: string, input: ItemInput) => request<SaveResponse>(`/api/items/${id}`, json('PUT', input)),
  setStatus: (id: string, status: ItemStatus, updated_by: string) =>
    request<SaveResponse>(`/api/items/${id}/status`, json('POST', { status, updated_by })),
  uploadPhoto: (id: string, file: File) => {
    const form = new FormData();
    form.append('photo', file, file.name || 'photo.jpg');
    return request<{ item: Item }>(`/api/items/${id}/photo`, { method: 'POST', body: form });
  },
  deletePhoto: (id: string) => request<{ item: Item }>(`/api/items/${id}/photo`, { method: 'DELETE' }),
  syncStatus: () => request<SyncStatus>('/api/sync/status'),
  sync: () => request<{ result: SyncResult; pending: number }>('/api/sync', { method: 'POST' }),
};
