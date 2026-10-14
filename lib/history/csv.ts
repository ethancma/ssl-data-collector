import type { HistoryColumn, HistoryRow } from "./datasets";

// Quoted per RFC 4180. A leading formula character gets a `'` so spreadsheets read the cell as text.
export function csvCell(value: string) {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

// Starts with a UTF-8 BOM so Excel detects the encoding.
export function buildCsv(columns: HistoryColumn[], rows: HistoryRow[]) {
  const lines = [columns.map((column) => column.label), ...rows.map((row) => columns.map((column) => column.text(row)))];
  return `\uFEFF${lines.map((line) => line.map(csvCell).join(",")).join("\r\n")}`;
}
