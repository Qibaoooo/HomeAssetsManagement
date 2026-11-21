export type ItemStatus = 'active' | 'retired';

/** Fields that live in the Google Sheet. Order here = preferred column order for new columns. */
export interface SheetFields {
  category: string;
  type: string;
  design: string;
  brand: string;
  location: string;
  size: string;
  quantity: number | null;
  remarks: string;
  tag: string;
  id: string;
  updated_at: string;
  updated_by: string;
  status: ItemStatus;
  purchase_date: string | null;
  price: number | null;
}

export interface Item extends SheetFields {
  photo: string | null; // filename under data/photos, never synced to the sheet
  dirty: number; // 1 = local change not yet written to the sheet
  created_at: string;
  /** content key of the row as last seen in / written to the sheet; used to detect hand edits vs app edits */
  synced_key: string | null;
}

/** What the API accepts on create / update. */
export type ItemInput = Partial<
  Pick<
    SheetFields,
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

/** Sheet header text <-> field name. Existing headers are matched case-insensitively. */
export const SHEET_COLUMNS: { header: string; field: keyof SheetFields }[] = [
  { header: 'Category', field: 'category' },
  { header: 'Type', field: 'type' },
  { header: 'Design', field: 'design' },
  { header: 'Brand', field: 'brand' },
  { header: 'Location', field: 'location' },
  { header: 'Size', field: 'size' },
  { header: 'Quantity', field: 'quantity' },
  { header: 'Remarks', field: 'remarks' },
  { header: 'Tag', field: 'tag' },
  { header: 'id', field: 'id' },
  { header: 'updated_at', field: 'updated_at' },
  { header: 'updated_by', field: 'updated_by' },
  { header: 'status', field: 'status' },
  { header: 'purchase_date', field: 'purchase_date' },
  { header: 'price', field: 'price' },
];

export const SYNCED_FIELDS = SHEET_COLUMNS.map((c) => c.field);
