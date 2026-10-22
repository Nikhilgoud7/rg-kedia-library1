// client/src/lib/csvHelper.ts — RFC 4180 CSV parser and client-side validation helpers

import { BulkImportRowValidationError, BulkImportSummary } from '../types';

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

export const VALID_CATEGORIES = ['TEXTBOOK', 'REFERENCE', 'GENERAL', 'LANGUAGE', 'JOURNAL'] as const;
export const VALID_CONDITIONS = ['Good', 'Fair', 'Poor', 'Damaged'] as const;
export const VALID_PROGRAMS = ['BCOM', 'BBA', 'BSC'] as const;

export const MAX_IMPORT_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

export interface RawCsvRow {
  rowNumber: number; // 1-based index corresponding to data rows in the sheet
  title: string;
  author: string;
  isbn: string;
  publisher: string;
  edition: string;
  publicationYear: string;
  category: string;
  segment: string;
  description: string;
  totalCopies: string;
  shelfLocation: string;
  barcodes: string;
  copyConditions: string;
  programs: string;
}

/**
 * Normalizes an ISBN by removing hyphens, spaces, and converting check digit to uppercase.
 */
export function normalizeIsbn(raw: string): string {
  return raw.replace(/[-\s]/g, '').trim().toUpperCase();
}

/**
 * Validates ISBN-10 and ISBN-13 format.
 */
export function isValidIsbn(raw: string): boolean {
  const clean = normalizeIsbn(raw);
  if (clean.length === 10) {
    return /^[0-9]{9}[0-9X]$/.test(clean);
  }
  if (clean.length === 13) {
    return /^(978|979)[0-9]{10}$/.test(clean);
  }
  return false;
}

/**
 * Zero-dependency RFC 4180 compliant CSV parser.
 * Handles quoted fields, internal quotes (""), commas, newlines, and BOM.
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
        if (nextChar === '\n') {
          currentRow.push(currentField);
          rows.push(currentRow);
          currentRow = [];
          currentField = '';
          i += 2;
          continue;
        } else {
          currentRow.push(currentField);
          rows.push(currentRow);
          currentRow = [];
          currentField = '';
          i++;
          continue;
        }
      } else if (char === '\n') {
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
        i++;
        continue;
      } else {
        currentField += char;
        i++;
        continue;
      }
    }
  }

  // Push final trailing field/row if any
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return rows;
}

/**
 * Validates parsed CSV lines on the client for immediate visual feedback.
 */
export function preValidateCsvData(
  headers: string[],
  rows: string[][]
): {
  rawRows: RawCsvRow[];
  errors: BulkImportRowValidationError[];
  summary: BulkImportSummary;
} {
  const errors: BulkImportRowValidationError[] = [];
  const rawRows: RawCsvRow[] = [];

  // Map header column names to indices
  const headerMap: Record<string, number> = {};
  headers.forEach((h, idx) => {
    headerMap[h.trim().toLowerCase()] = idx;
  });

  // Check required columns
  for (const col of BULK_IMPORT_COLUMNS) {
    if (headerMap[col.toLowerCase()] === undefined) {
      errors.push({
        row: 0,
        column: col,
        message: `Missing required column header: "${col}"`,
      });
    }
  }

  const seenIsbns = new Map<string, number>();
  const seenBarcodes = new Map<string, number>();
  let totalPhysicalCopies = 0;
  let totalBarcodes = 0;

  rows.forEach((row, rowIdx) => {
    const rowNumber = rowIdx + 1; // 1-based data row
    const getVal = (col: string): string => {
      const idx = headerMap[col.toLowerCase()];
      return idx !== undefined && row[idx] !== undefined ? row[idx].trim() : '';
    };

    const title = getVal('Title');
    const author = getVal('Author');
    const isbn = getVal('ISBN');
    const publisher = getVal('Publisher');
    const edition = getVal('Edition');
    const publicationYear = getVal('PublicationYear');
    const category = getVal('Category');
    const segment = getVal('Segment');
    const description = getVal('Description');
    const totalCopiesStr = getVal('TotalCopies');
    const shelfLocation = getVal('ShelfLocation');
    const barcodesStr = getVal('Barcodes');
    const copyConditionsStr = getVal('CopyConditions');
    const programsStr = getVal('Programs');

    rawRows.push({
      rowNumber,
      title,
      author,
      isbn,
      publisher,
      edition,
      publicationYear,
      category,
      segment,
      description,
      totalCopies: totalCopiesStr,
      shelfLocation,
      barcodes: barcodesStr,
      copyConditions: copyConditionsStr,
      programs: programsStr,
    });

    // Validate Title
    if (!title) {
      errors.push({ row: rowNumber, column: 'Title', message: 'Title is required.' });
    }

    // Validate Author
    if (!author) {
      errors.push({ row: rowNumber, column: 'Author', message: 'Author is required.' });
    }

    // Validate Segment
    if (!segment) {
      errors.push({ row: rowNumber, column: 'Segment', message: 'Segment/Subject is required.' });
    }

    // Validate Category
    if (category && !(VALID_CATEGORIES as readonly string[]).includes(category.toUpperCase())) {
      errors.push({
        row: rowNumber,
        column: 'Category',
        message: `Invalid Category "${category}". Allowed: ${VALID_CATEGORIES.join(', ')}`,
        value: category,
      });
    }

    // Validate PublicationYear
    if (publicationYear) {
      const year = parseInt(publicationYear, 10);
      const currentYear = new Date().getFullYear();
      if (isNaN(year) || year < 1800 || year > currentYear + 1) {
        errors.push({
          row: rowNumber,
          column: 'PublicationYear',
          message: `Publication Year must be a valid 4-digit year between 1800 and ${currentYear + 1}.`,
          value: publicationYear,
        });
      }
    }

    // Validate TotalCopies
    let parsedCopies = 1;
    if (totalCopiesStr) {
      parsedCopies = parseInt(totalCopiesStr, 10);
      if (isNaN(parsedCopies) || parsedCopies < 1 || parsedCopies > 100) {
        errors.push({
          row: rowNumber,
          column: 'TotalCopies',
          message: 'TotalCopies must be a number between 1 and 100.',
          value: totalCopiesStr,
        });
        parsedCopies = 1;
      }
    }
    totalPhysicalCopies += parsedCopies;

    // Validate ISBN
    if (isbn) {
      const cleanIsbn = normalizeIsbn(isbn);
      if (!isValidIsbn(cleanIsbn)) {
        errors.push({
          row: rowNumber,
          column: 'ISBN',
          message: `Invalid ISBN format "${isbn}". Must be a valid 10 or 13-digit ISBN.`,
          value: isbn,
        });
      } else {
        if (seenIsbns.has(cleanIsbn)) {
          const firstSeen = seenIsbns.get(cleanIsbn)!;
          errors.push({
            row: rowNumber,
            column: 'ISBN',
            message: `Duplicate ISBN in sheet: "${isbn}" was already declared in Row ${firstSeen}.`,
            value: isbn,
          });
        } else {
          seenIsbns.set(cleanIsbn, rowNumber);
        }
      }
    }

    // Validate Barcodes
    if (barcodesStr) {
      const barcodes = barcodesStr.split(';').map((b) => b.trim()).filter(Boolean);
      if (barcodes.length > parsedCopies) {
        errors.push({
          row: rowNumber,
          column: 'Barcodes',
          message: `Barcodes count (${barcodes.length}) exceeds TotalCopies (${parsedCopies}).`,
          value: barcodesStr,
        });
      }
      for (const bc of barcodes) {
        totalBarcodes++;
        if (seenBarcodes.has(bc)) {
          const firstSeen = seenBarcodes.get(bc)!;
          errors.push({
            row: rowNumber,
            column: 'Barcodes',
            message: `Duplicate barcode in sheet: "${bc}" was already declared in Row ${firstSeen}.`,
            value: bc,
          });
        } else {
          seenBarcodes.set(bc, rowNumber);
        }
      }
    }

    // Validate CopyConditions
    if (copyConditionsStr) {
      const conditions = copyConditionsStr.split(';').map((c) => c.trim()).filter(Boolean);
      for (const cond of conditions) {
        if (!(VALID_CONDITIONS as readonly string[]).includes(cond)) {
          errors.push({
            row: rowNumber,
            column: 'CopyConditions',
            message: `Invalid condition "${cond}". Allowed: ${VALID_CONDITIONS.join(', ')}.`,
            value: cond,
          });
        }
      }
    }

    // Validate Programs
    if (programsStr) {
      const progItems = programsStr.split(';').map((p) => p.trim()).filter(Boolean);
      for (const item of progItems) {
        const [progCode] = item.split(':').map((s) => s.trim());
        if (!(VALID_PROGRAMS as readonly string[]).includes(progCode.toUpperCase())) {
          errors.push({
            row: rowNumber,
            column: 'Programs',
            message: `Invalid Program "${progCode}". Allowed: ${VALID_PROGRAMS.join(', ')}.`,
            value: progCode,
          });
        }
      }
    }
  });

  const errorRowSet = new Set(errors.filter((e) => e.row > 0).map((e) => e.row));
  const errorRowCount = errorRowSet.size;
  const validRowCount = rows.length - errorRowCount;

  return {
    rawRows,
    errors,
    summary: {
      totalRows: rows.length,
      validRowCount,
      errorRowCount,
      totalBooks: rows.length,
      totalPhysicalCopies,
      uniqueIsbns: seenIsbns.size,
      totalBarcodes,
    },
  };
}
