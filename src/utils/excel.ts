import type { Cell } from "../training/dataset";

type Rows = readonly (readonly (string | number)[])[];

/**
 * Reads the first sheet of an .xlsx, or a .csv, into rows of cells. CSV comes
 * in two dialects in practice: comma-separated, and the semicolon-separated
 * one a Ukrainian or Polish Excel saves, where the comma is the decimal mark.
 */
export async function readTable(file: File): Promise<Cell[][]> {
  if (/\.csv$/i.test(file.name)) return parseCsv(await file.text());
  const { readSheet } = await import("read-excel-file/universal");
  return (await readSheet(file)) as Cell[][];
}

export function parseCsv(text: string): Cell[][] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return [];
  const delimiter = lines[0].includes(";") ? ";" : lines[0].includes("\t") ? "\t" : ",";
  return lines.map((line) => line.split(delimiter).map((c) => c.trim().replace(/^"(.*)"$/, "$1")));
}

const cells = (rows: Rows) => rows.map((row) => row.map((value) => ({ value })));

/** Saves one or more named sheets as an .xlsx through the browser's download. */
export async function downloadXlsx(
  sheets: readonly { readonly name: string; readonly rows: Rows }[],
  fileName: string,
): Promise<void> {
  const { default: writeXlsxFile } = await import("write-excel-file/universal");
  const blob = await writeXlsxFile(sheets.map((s) => ({ sheet: s.name, data: cells(s.rows) }))).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
