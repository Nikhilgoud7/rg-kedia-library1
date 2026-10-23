// server/lib/bulkImportFormat.ts — CSV format definitions, RFC 4180 parser & serializer

export const BULK_IMPORT_COLUMNS = [
  'Title',
  'Author',
  'ISBN',
  'Publisher',
  'Edition',
  'PublicationYear',
  'Category',
  'Segment',
  'Description',
  'TotalCopies',
  'ShelfLocation',
  'Barcodes',
  'CopyConditions',
  'Programs',
] as const;

export type BulkImportColumn = typeof BULK_IMPORT_COLUMNS[number];

/**
 * Escapes leading formula trigger characters (=, +, -, @, tab, CR)
 * to prevent spreadsheet formula injection / CSV macro execution.
 */
export function sanitizeCsvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const raw = String(value);
  if (raw.length === 0) return '';

  const triggerChars = ['=', '+', '-', '@', '\t', '\r'];
  if (triggerChars.includes(raw.charAt(0))) {
    return `'${raw.trim()}`;
  }

  const trimmed = raw.trim();
  if (trimmed.length > 0 && triggerChars.includes(trimmed.charAt(0))) {
    return `'${trimmed}`;
  }

  return trimmed;
}

/**
 * Formats a single CSV value according to RFC 4180.
 * Wraps in quotes if it contains commas, newlines, or quotes, and escapes internal quotes.
 */
export function formatCsvValue(value: string | number | null | undefined): string {
  const sanitized = sanitizeCsvField(value);
  if (sanitized.includes('"') || sanitized.includes(',') || sanitized.includes('\n') || sanitized.includes('\r')) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }
  return sanitized;
}

/**
 * Serializes an array of string arrays into an RFC 4180 CSV string with CRLF line endings.
 */
export function serializeCsv(rows: string[][], withBom = true): string {
  const content = rows.map((row) => row.map(formatCsvValue).join(',')).join('\r\n');
  return withBom ? `\uFEFF${content}` : content;
}

/**
 * Zero-dependency RFC 4180 compliant CSV parser.
 * Handles quoted fields, internal quotes, commas, CRLF/LF line endings, and BOM.
 */
export function parseCsv(csvText: string): string[][] {
  if (!csvText || typeof csvText !== 'string') {
    return [];
  }

  // Strip UTF-8 BOM if present
  let cleanText = csvText;
  if (cleanText.charCodeAt(0) === 0xFEFF) {
    cleanText = cleanText.slice(1);
  }

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let insideQuotes = false;
  let i = 0;
  const len = cleanText.length;

  while (i < len) {
    const char = cleanText[i];
    const nextChar = i + 1 < len ? cleanText[i + 1] : null;

    if (insideQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // Escaped quote: "" -> "
          currentField += '"';
          i += 2;
          continue;
        } else {
          // Closing quote
          insideQuotes = false;
          i++;
          continue;
        }
      } else {
        currentField += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        insideQuotes = true;
        i++;
        continue;
      } else if (char === ',') {
        currentRow.push(currentField);
        currentField = '';
        i++;
        continue;
      } else if (char === '\r') {
        if (nextChar === '\n') {
          i++; // Skip \n
        }
        currentRow.push(currentField);
        currentField = '';
        // Only push row if not completely empty
        if (currentRow.some((f) => f.trim().length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        i++;
        continue;
      } else if (char === '\n') {
        currentRow.push(currentField);
        currentField = '';
        if (currentRow.some((f) => f.trim().length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        i++;
        continue;
      } else {
        currentField += char;
        i++;
        continue;
      }
    }
  }

  // Handle remaining field/row at EOF
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    if (currentRow.some((f) => f.trim().length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * Generates the official downloadable RG-Kedia Book Import CSV template.
 * Includes UTF-8 BOM, standard headers, and 2 helpful example rows.
 */
export function generateBookImportTemplateCsv(): string {
  const header = [...BULK_IMPORT_COLUMNS];

  const exampleRow1 = [
    'Financial Accounting & Analysis',
    'Dr. K. S. Sharma',
    '978-81-203-5120-1',
    'Himalaya Publishing House',
    '4th Edition',
    '2024',
    'TEXTBOOK',
    'Accounting & Finance',
    'Core textbook covering Indian accounting standards and financial statements.',
    '3',
    'Rack Commerce-B2',
    'BC-ACC-101;BC-ACC-102;BC-ACC-103',
    'Good;Good;Good',
    'BCOM:General;BBA:Finance',
  ];

  const exampleRow2 = [
    'Business Statistics Fundamentals',
    'Prof. M. R. Varma',
    '978-93-513-4211-8',
    'Sultan Chand & Sons',
    '2nd Edition',
    '2023',
    'REFERENCE',
    'Quantitative Methods',
    'Reference handbook on probability, regression, and sampling.',
    '1',
    'Rack Math-A1',
    'BC-STAT-201',
    'Good',
    'BCOM:Computer Applications;BSC:Mathematics',
  ];

  return serializeCsv([header, exampleRow1, exampleRow2], true);
}
