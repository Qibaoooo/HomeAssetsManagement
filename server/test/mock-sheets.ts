/**
 * In-memory mock of the Google Sheets v4 endpoints this app uses:
 *   GET  /v4/spreadsheets/:id/values/:range            (values.get)
 *   PUT  /v4/spreadsheets/:id/values/:range            (values.update)
 *   POST /v4/spreadsheets/:id/values:batchUpdate       (values.batchUpdate)
 *   POST /v4/spreadsheets/:id/values/:range:append     (values.append)
 *   POST /v4/spreadsheets/:id:batchUpdate              (spreadsheets.batchUpdate, addSheet only)
 *
 * Behaves like the real API where it matters for sync: trailing empty cells and rows are
 * omitted from reads, append writes after the last non-empty row of the tab, and a range on a
 * tab that does not exist fails with 400 "Unable to parse range".
 */
import http from 'node:http';

// No imports from ../src here: the app's config reads process.env at import time, and tests
// must be able to start the mock (to learn its port) before loading any app module.
function colLetter(index: number): string {
  let s = '';
  let n = index + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export type Grid = string[][];

interface Range {
  tab: string;
  c1: number;
  r1: number;
  c2: number; // inclusive; Infinity when open
  r2: number;
}

function colIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function parseRange(raw: string): Range {
  const s = decodeURIComponent(raw);
  const m = /^(?:'([^']+)'|([^!]+))(?:!(.+))?$/.exec(s);
  if (!m) throw new Error(`bad range ${s}`);
  const tab = m[1] ?? m[2]!;
  const a1 = m[3];
  if (!a1) return { tab, c1: 0, r1: 0, c2: Infinity, r2: Infinity };
  const [start, end] = a1.split(':');
  const cell = (ref: string, open: number) => {
    const mm = /^([A-Za-z]*)(\d*)$/.exec(ref)!;
    return { c: mm[1] ? colIndex(mm[1]) : open, r: mm[2] ? Number(mm[2]) - 1 : open };
  };
  const a = cell(start!, 0);
  const b = end ? cell(end, Infinity) : a;
  return { tab, c1: a.c, r1: a.r, c2: b.c, r2: b.r };
}

export interface MockSheets {
  url: string;
  /** main tab */
  grid: () => Grid;
  set: (rows: Grid) => void;
  cell: (row: number, col: number, value: string) => void; // 0-based
  deleteRow: (row: number) => void; // 0-based
  /** any other tab: undefined when it does not exist */
  tab: (name: string) => Grid | undefined;
  setTab: (name: string, rows: Grid) => void;
  dropTab: (name: string) => void;
  calls: { method: string; path: string }[];
  close: () => Promise<void>;
}

class MissingTab extends Error {}

const trimmed = (rows: Grid): Grid => {
  const out = rows.map((r) => {
    let end = r.length;
    while (end > 0 && (r[end - 1] ?? '') === '') end--;
    return r.slice(0, end);
  });
  while (out.length && out[out.length - 1]!.length === 0) out.pop();
  return out;
};

export async function startMockSheets(opts: { tab: string; rows: Grid; port?: number }): Promise<MockSheets> {
  const tabs = new Map<string, Grid>([[opts.tab, opts.rows.map((r) => [...r])]]);
  const calls: { method: string; path: string }[] = [];

  const gridOf = (tab: string): Grid => {
    const g = tabs.get(tab);
    if (!g) throw new MissingTab(`Unable to parse range: '${tab}'`);
    return g;
  };
  const sub = (rg: Range): Grid => {
    const rows = gridOf(rg.tab).slice(rg.r1, rg.r2 === Infinity ? undefined : rg.r2 + 1);
    return trimmed(rows.map((r) => r.slice(rg.c1, rg.c2 === Infinity ? undefined : rg.c2 + 1)));
  };
  const write = (tab: string, r0: number, c0: number, values: unknown[][]) => {
    const grid = gridOf(tab);
    values.forEach((row, i) => {
      const r = r0 + i;
      while (grid.length <= r) grid.push([]);
      row.forEach((v, j) => {
        const line = grid[r]!;
        while (line.length <= c0 + j) line.push('');
        line[c0 + j] = v == null ? '' : String(v);
      });
    });
  };
  const lastDataRow = (tab: string) => {
    let last = -1;
    gridOf(tab).forEach((r, i) => {
      if (r.some((c) => c !== '')) last = i;
    });
    return last;
  };
  const rangeString = (rg: Range, rows: number, cols: number) =>
    `'${rg.tab}'!${colLetter(rg.c1)}${rg.r1 + 1}:${colLetter(rg.c1 + Math.max(cols, 1) - 1)}${rg.r1 + Math.max(rows, 1)}`;

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const path = url.pathname;
    calls.push({ method: req.method ?? '', path });
    const body = await new Promise<string>((resolve) => {
      let s = '';
      req.on('data', (c) => (s += c)).on('end', () => resolve(s));
    });
    const json = (code: number, data: unknown) => {
      res.writeHead(code, { 'content-type': 'application/json' });
      res.end(JSON.stringify(data));
    };
    try {
      let m: RegExpExecArray | null;
      if ((m = /^\/v4\/spreadsheets\/[^/]+:batchUpdate$/.exec(path)) && req.method === 'POST') {
        const { requests } = JSON.parse(body) as { requests: { addSheet?: { properties?: { title?: string } } }[] };
        for (const r of requests) {
          const title = r.addSheet?.properties?.title;
          if (!title) return json(400, { error: { code: 400, message: 'mock: only addSheet is supported' } });
          if (tabs.has(title)) return json(400, { error: { code: 400, message: `A sheet with the name "${title}" already exists.` } });
          tabs.set(title, []);
        }
        return json(200, { replies: requests.map(() => ({})) });
      }
      if ((m = /^\/v4\/spreadsheets\/[^/]+\/values:batchUpdate$/.exec(path)) && req.method === 'POST') {
        const { data } = JSON.parse(body) as { data: { range: string; values: unknown[][] }[] };
        for (const d of data) {
          const rg = parseRange(d.range);
          write(rg.tab, rg.r1, rg.c1, d.values);
        }
        return json(200, { totalUpdatedCells: data.length, responses: data.map((d) => ({ updatedRange: d.range })) });
      }
      if ((m = /^\/v4\/spreadsheets\/[^/]+\/values\/(.+):append$/.exec(path)) && req.method === 'POST') {
        const rg = parseRange(m[1]!);
        const { values } = JSON.parse(body) as { values: unknown[][] };
        const start = lastDataRow(rg.tab) + 1;
        write(rg.tab, start, rg.c1, values);
        return json(200, { updates: { updatedRange: rangeString({ ...rg, r1: start }, values.length, values[0]?.length ?? 0), updatedRows: values.length } });
      }
      if ((m = /^\/v4\/spreadsheets\/[^/]+\/values\/(.+)$/.exec(path))) {
        const rg = parseRange(m[1]!);
        if (req.method === 'GET') {
          const values = sub(rg);
          return json(200, { range: m[1], majorDimension: 'ROWS', ...(values.length ? { values } : {}) });
        }
        if (req.method === 'PUT') {
          const { values } = JSON.parse(body) as { values: unknown[][] };
          write(rg.tab, rg.r1, rg.c1, values);
          return json(200, { updatedRange: m[1], updatedRows: values.length, updatedCells: values.reduce((n, r) => n + r.length, 0) });
        }
      }
      json(404, { error: { code: 404, message: `mock: unsupported ${req.method} ${path}` } });
    } catch (e) {
      if (e instanceof MissingTab) return json(400, { error: { code: 400, message: e.message, status: 'INVALID_ARGUMENT' } });
      json(500, { error: { code: 500, message: String(e) } });
    }
  });
  await new Promise<void>((r) => server.listen(opts.port ?? 0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;

  return {
    url: `http://127.0.0.1:${port}/`,
    grid: () => trimmed(gridOf(opts.tab)).map((r) => [...r]),
    set: (rows) => {
      tabs.set(opts.tab, rows.map((r) => [...r]));
    },
    cell: (row, col, value) => write(opts.tab, row, col, [[value]]),
    deleteRow: (row) => {
      gridOf(opts.tab).splice(row, 1);
    },
    tab: (name) => {
      const g = tabs.get(name);
      return g ? trimmed(g).map((r) => [...r]) : undefined;
    },
    setTab: (name, rows) => {
      tabs.set(name, rows.map((r) => [...r]));
    },
    dropTab: (name) => {
      tabs.delete(name);
    },
    calls,
    close: () => new Promise((r) => server.close(() => r())),
  };
}
