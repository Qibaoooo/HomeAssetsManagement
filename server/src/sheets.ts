import { google, type sheets_v4 } from 'googleapis';
import { config } from './config.js';
import { SHEET_COLUMNS, type SheetFields } from './types.js';

let client: sheets_v4.Sheets | undefined;
function sheets(): sheets_v4.Sheets {
  if (!client) {
    const auth = new google.auth.GoogleAuth({
      keyFile: config.keyFile,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    client = google.sheets({ version: 'v4', auth });
  }
  return client;
}

/** 0-based column index -> A1 letters. */
export function colLetter(index: number): string {
  let s = '';
  let n = index + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export interface SheetSnapshot {
  /** header text per column, as in the sheet */
  headers: string[];
  /** field name -> column index, for every known field present in the header row */
  colOf: Map<keyof SheetFields, number>;
  /** raw data rows (index 0 = sheet row 2); may be shorter than headers */
  rows: string[][];
}

const cell = (v: unknown) => (v == null ? '' : String(v).trim());

/** Read the whole tab and make sure every column we need exists (adds missing ones to the header row). */
export async function readSheet(): Promise<SheetSnapshot> {
  const api = sheets();
  const tab = config.sheetTab;
  const res = await api.spreadsheets.values.get({
    spreadsheetId: config.sheetId,
    range: `'${tab}'`,
    valueRenderOption: 'FORMATTED_VALUE',
  });
  const values = (res.data.values ?? []) as unknown[][];
  const headers = (values[0] ?? []).map(cell);
  const rows = values.slice(1).map((r) => r.map(cell));

  // Match existing headers case-insensitively; append any that are missing.
  const lower = headers.map((h) => h.toLowerCase());
  const colOf = new Map<keyof SheetFields, number>();
  const missing: { header: string; field: keyof SheetFields }[] = [];
  for (const c of SHEET_COLUMNS) {
    const i = lower.indexOf(c.header.toLowerCase());
    if (i >= 0) colOf.set(c.field, i);
    else missing.push(c);
  }
  if (missing.length) {
    // Append after the last non-empty header so we do not land on a stray blank column.
    let start = headers.length;
    while (start > 0 && headers[start - 1] === '') start--;
    const newHeaders = missing.map((m) => m.header);
    await api.spreadsheets.values.update({
      spreadsheetId: config.sheetId,
      range: `'${tab}'!${colLetter(start)}1`,
      valueInputOption: 'RAW',
      requestBody: { values: [newHeaders] },
    });
    missing.forEach((m, k) => {
      headers[start + k] = m.header;
      colOf.set(m.field, start + k);
    });
    for (let i = 0; i < headers.length; i++) headers[i] ??= '';
  }
  return { headers, colOf, rows };
}

export function rowToFields(snap: SheetSnapshot, row: string[]): Record<keyof SheetFields, string> {
  const out = {} as Record<keyof SheetFields, string>;
  for (const [field, i] of snap.colOf) out[field] = row[i] ?? '';
  return out;
}

/**
 * Build a full sheet row from fields. Columns the app does not know about (added by hand
 * in the sheet) keep whatever `existing` holds, so a push never wipes them.
 */
export function fieldsToRow(snap: SheetSnapshot, fields: SheetFields, existing: string[] = []): (string | number)[] {
  const width = snap.headers.length;
  const row: (string | number)[] = Array.from({ length: width }, (_, i) => existing[i] ?? '');
  for (const [field, i] of snap.colOf) {
    const v = fields[field];
    row[i] = v == null ? '' : v;
  }
  return row;
}

/** Overwrite full rows. rowNumber is the 1-based sheet row (data starts at 2). */
export async function writeRows(snap: SheetSnapshot, updates: { rowNumber: number; values: (string | number)[] }[]) {
  if (!updates.length) return;
  const last = colLetter(snap.headers.length - 1);
  await sheets().spreadsheets.values.batchUpdate({
    spreadsheetId: config.sheetId,
    requestBody: {
      valueInputOption: 'RAW',
      data: updates.map((u) => ({
        range: `'${config.sheetTab}'!A${u.rowNumber}:${last}${u.rowNumber}`,
        values: [u.values],
      })),
    },
  });
}

/** Append rows after the table. */
export async function appendRows(snap: SheetSnapshot, rows: (string | number)[][]) {
  if (!rows.length) return;
  const last = colLetter(snap.headers.length - 1);
  await sheets().spreadsheets.values.append({
    spreadsheetId: config.sheetId,
    range: `'${config.sheetTab}'!A1:${last}`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
}
