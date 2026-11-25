export type ItemStatus = 'active' | 'retired';

export interface Item {
  id: string;
  category: string;
  type: string;
  design: string;
  brand: string;
  location: string;
  size: string;
  quantity: number | null;
  remarks: string;
  tag: string;
  status: ItemStatus;
  purchase_date: string | null;
  price: number | null;
  updated_at: string;
  updated_by: string;
  photo: string | null;
  photo_url: string | null;
  thumb_url: string | null;
  dirty: number;
  created_at: string;
}

export type ItemInput = Partial<
  Pick<
    Item,
    | 'category'
    | 'type'
    | 'design'
    | 'brand'
    | 'location'
    | 'size'
    | 'quantity'
    | 'remarks'
    | 'tag'
    | 'purchase_date'
    | 'price'
    | 'status'
  >
> & { updated_by?: string };

export interface Meta {
  categories: string[];
  types: string[];
  brands: string[];
  locations: string[];
  tags: string[];
  sizes: string[];
}

/** One node of the location tree (Settings > Locations). */
export interface LocationNode {
  path: string;
  name: string;
  depth: number;
  active: number;
  retired: number;
  subtreeActive: number;
  subtreeTotal: number;
}
export interface LocationUsage {
  nodes: LocationNode[];
  /** item locations not in the list (typed by hand in the sheet) */
  unlisted: { location: string; active: number; retired: number }[];
}

export interface SyncResult {
  at: string;
  ok: boolean;
  error?: string;
  pulled: number;
  pushed: number;
  appended: number;
  backfilled: number;
  retired: number;
  conflicts: number;
  durationMs: number;
}

export interface BackupResult {
  at: string;
  ok: boolean;
  error?: string;
  unchanged: boolean;
  sqliteBytes: number;
  photosUploaded: number;
  photosTotal: number;
  durationMs: number;
}

export interface BackupHistoryRow {
  at: string;
  ok: boolean;
  reason: string;
  sqlite_bytes: number;
  photos_uploaded: number;
  photos_total: number;
  duration_ms: number;
  error: string | null;
}

export interface BackupStatus {
  state: 'ready' | 'off' | 'no-client' | 'no-token';
  folder: string;
  intervalHours: number;
  /** most recent run, including "nothing changed" checks */
  last: BackupResult | null;
  /** runs that uploaded something or failed, newest first */
  history: BackupHistoryRow[];
}

export interface SyncStatus {
  last: SyncResult | null;
  pending: number;
  log: { at: string; level: string; message: string }[];
}
