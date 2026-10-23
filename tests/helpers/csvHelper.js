// tests/helpers/csvHelper.js — RFC 4180 CSV serialization & parsing helpers for regression tests

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
];

export function sanitizeCsvField(value) {
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

export function formatCsvValue(value) {
  const sanitized = sanitizeCsvField(value);
  if (sanitized.includes('"') || sanitized.includes(',') || sanitized.includes('\n') || sanitized.includes('\r')) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }
  return sanitized;
}

export function serializeCsv(rows, withBom = false) {
  const content = rows.map((row) => row.map(formatCsvValue).join(',')).join('\r\n');
  return withBom ? `\uFEFF${content}` : content;
}

export function parseCsv(csvText) {
  if (!csvText || typeof csvText !== 'string') return [];
  let cleanText = csvText;
  if (cleanText.charCodeAt(0) === 0xFEFF) {
    cleanText = cleanText.slice(1);
  }

  const rows = [];
  let currentRow = [];
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
          currentField += '"';
          i += 2;
          continue;
        } else {
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
        if (nextChar === '\n') i++;
        currentRow.push(currentField);
        currentField = '';
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

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    if (currentRow.some((f) => f.trim().length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

export function normalizeIsbn(raw) {
  return raw.replace(/[-\s]/g, '').trim().toUpperCase();
}

export function generateBookImportTemplateCsv() {
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
