/**
 * Reusable CSV generation library with Spreadsheet Formula Injection (CSV Injection) protection.
 *
 * Defense-in-depth:
 * When values in a CSV start with formula trigger characters (`=`, `+`, `-`, `@`, `\t`, `\r`),
 * spreadsheet software (Microsoft Excel, LibreOffice, Google Sheets) may interpret them as
 * dynamic expressions or executable commands (e.g. `=CMD|...` or `@SUM(...)`).
 *
 * Prepending an apostrophe `'` neutralizes execution across major spreadsheet engines
 * without mutating legitimate display text when opened in spreadsheets.
 */

export interface CsvColumn<T = any> {
  key: string;
  header: string;
  formatter?: (row: T) => any;
}

export interface CsvOptions {
  includeBom?: boolean;
  neutralizeFormulas?: boolean;
}

const FORMULA_TRIGGERS = new Set(['=', '+', '-', '@', '\t', '\r']);

/**
 * Neutralizes potentially malicious spreadsheet formula triggers.
 *
 * If a string value starts with any of `=`, `+`, `-`, `@`, `\t`, or `\r`,
 * an apostrophe `'` is prepended so that spreadsheet programs treat it as literal text.
 */
export function neutralizeFormulaInjection(value: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    return value;
  }

  const firstChar = value.charAt(0);
  if (FORMULA_TRIGGERS.has(firstChar)) {
    return `'${value}`;
  }

  // Also check if leading whitespace hides a formula trigger
  const trimmed = value.trimStart();
  if (trimmed.length > 0 && FORMULA_TRIGGERS.has(trimmed.charAt(0))) {
    return `'${value}`;
  }

  return value;
}

/**
 * Formats and escapes an individual cell value according to RFC 4180.
 */
export function formatCsvCell(rawValue: any, neutralize = true): string {
  if (rawValue === null || rawValue === undefined) {
    return '';
  }

  let strValue: string;
  if (rawValue instanceof Date) {
    strValue = rawValue.toISOString();
  } else if (typeof rawValue === 'object') {
    strValue = JSON.stringify(rawValue);
  } else {
    strValue = String(rawValue);
  }

  if (neutralize) {
    strValue = neutralizeFormulaInjection(strValue);
  }

  // Check if quoting is needed: contains quotes, commas, newlines, or begins/ends with whitespace
  const needsQuotes =
    strValue.includes('"') ||
    strValue.includes(',') ||
    strValue.includes('\n') ||
    strValue.includes('\r');

  if (needsQuotes) {
    // RFC 4180: Double any existing quote marks
    return `"${strValue.replace(/"/g, '""')}"`;
  }

  return strValue;
}

/**
 * Generates an RFC 4180 compliant CSV string from an array of objects.
 */
export function generateCsv<T = any>(
  data: T[],
  columns: CsvColumn<T>[],
  options: CsvOptions = {}
): string {
  const { includeBom = true, neutralizeFormulas = true } = options;

  const headerRow = columns
    .map((col) => formatCsvCell(col.header, false))
    .join(',');

  const rows = data.map((item) => {
    return columns
      .map((col) => {
        const val = col.formatter ? col.formatter(item) : (item as any)[col.key];
        return formatCsvCell(val, neutralizeFormulas);
      })
      .join(',');
  });

  const csvBody = [headerRow, ...rows].join('\r\n');

  // Prepend UTF-8 BOM (\uFEFF) if requested, enabling Excel to render Unicode correctly without prompt
  return includeBom ? `\uFEFF${csvBody}` : csvBody;
}
