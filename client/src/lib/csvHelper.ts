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
export const MAX_IMPORT_ROWS = 1000;

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
          i++; // Skip \n
        }
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

  // Push final trailing field/row if any and not blank
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    if (currentRow.some((f) => f.trim().length > 0)) {
      rows.push(currentRow);
    }
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

  // Enforce maximum row limit (1,000 data rows)
  if (rows.length > MAX_IMPORT_ROWS) {
    errors.push({
      row: 0,
      column: 'Data',
      message: `File exceeds maximum row limit of ${MAX_IMPORT_ROWS} data rows (found ${rows.length} rows).`,
    });
  }

  const seenIsbns = new Map<string, number>();
  const seenBarcodes = new Map<string, number>();
  let totalPhysicalCopies = 0;
  let totalBarcodes = 0;
  const currentYear = new Date().getFullYear();

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

    // Validate Title (required, max 255)
    if (!title) {
      errors.push({ row: rowNumber, column: 'Title', message: 'Book title is required.' });
    } else if (title.length > 255) {
      errors.push({ row: rowNumber, column: 'Title', message: `Title exceeds maximum length of 255 characters (length: ${title.length}).`, value: title });
    }

    // Validate Author (required, max 255)
    if (!author) {
      errors.push({ row: rowNumber, column: 'Author', message: 'Author is required.' });
    } else if (author.length > 255) {
      errors.push({ row: rowNumber, column: 'Author', message: `Author exceeds maximum length of 255 characters (length: ${author.length}).`, value: author });
    }

    // Validate Segment (required, max 100)
    if (!segment) {
      errors.push({ row: rowNumber, column: 'Segment', message: 'Academic segment is required (e.g. Accounting, Statistics, Computer Science).' });
    } else if (segment.length > 100) {
      errors.push({ row: rowNumber, column: 'Segment', message: 'Segment exceeds maximum length of 100 characters.', value: segment });
    }

    // Validate Publisher (optional, max 255)
    if (publisher && publisher.length > 255) {
      errors.push({ row: rowNumber, column: 'Publisher', message: 'Publisher exceeds maximum length of 255 characters.', value: publisher });
    }

    // Validate Edition (optional, max 100)
    if (edition && edition.length > 100) {
      errors.push({ row: rowNumber, column: 'Edition', message: 'Edition exceeds maximum length of 100 characters.', value: edition });
    }

    // Validate Description (optional, max 2000)
    if (description && description.length > 2000) {
      errors.push({ row: rowNumber, column: 'Description', message: 'Description exceeds maximum length of 2000 characters.' });
    }

    // Validate ShelfLocation (optional, max 100)
    if (shelfLocation && shelfLocation.length > 100) {
      errors.push({ row: rowNumber, column: 'ShelfLocation', message: 'Shelf location exceeds maximum length of 100 characters.', value: shelfLocation });
    }

    // Validate Category (optional, default TEXTBOOK)
    if (category && !(VALID_CATEGORIES as readonly string[]).includes(category.toUpperCase())) {
      errors.push({
        row: rowNumber,
        column: 'Category',
        message: `Invalid category "${category}". Allowed: ${VALID_CATEGORIES.join(', ')}.`,
        value: category,
      });
    }

    // Validate PublicationYear (optional, integer 1000 to currentYear + 1, 4-digit regex)
    if (publicationYear) {
      const parsedYear = parseInt(publicationYear, 10);
      if (isNaN(parsedYear) || !/^\d{4}$/.test(publicationYear) || parsedYear < 1000 || parsedYear > currentYear + 1) {
        errors.push({
          row: rowNumber,
          column: 'PublicationYear',
          message: `Invalid publication year "${publicationYear}". Must be a 4-digit year between 1000 and ${currentYear + 1}.`,
          value: publicationYear,
        });
      }
    }

    // Validate TotalCopies (optional, integer 1 to 100, strict integer check)
    let parsedCopies = 1;
    if (totalCopiesStr) {
      const parsed = parseInt(totalCopiesStr, 10);
      if (isNaN(parsed) || parsed < 1 || parsed > 100 || !/^\d+$/.test(totalCopiesStr)) {
        errors.push({
          row: rowNumber,
          column: 'TotalCopies',
          message: `Invalid total copies "${totalCopiesStr}". Must be an integer between 1 and 100.`,
          value: totalCopiesStr,
        });
        parsedCopies = 1;
      } else {
        parsedCopies = parsed;
      }
    }
    totalPhysicalCopies += parsedCopies;

    // Validate ISBN (optional, format & uniqueness)
    if (isbn) {
      const cleanIsbn = normalizeIsbn(isbn);
      if (!isValidIsbn(cleanIsbn)) {
        errors.push({
          row: rowNumber,
          column: 'ISBN',
          message: `Invalid ISBN format "${isbn}". Must be a valid 10 or 13 digit ISBN.`,
          value: isbn,
        });
      } else {
        if (seenIsbns.has(cleanIsbn)) {
          const firstSeen = seenIsbns.get(cleanIsbn)!;
          errors.push({
            row: rowNumber,
            column: 'ISBN',
            message: `Duplicate ISBN "${isbn}" in file (previously seen in Row ${firstSeen}).`,
            value: isbn,
          });
        } else {
          seenIsbns.set(cleanIsbn, rowNumber);
        }
      }
    }

    // Validate Barcodes (optional, semicolon/comma delimited, max 100 per barcode)
    if (barcodesStr) {
      const barcodes = barcodesStr.split(/[;,]/).map((b) => b.trim()).filter(Boolean);
      if (barcodes.length > parsedCopies) {
        errors.push({
          row: rowNumber,
          column: 'Barcodes',
          message: `Row specifies ${barcodes.length} barcodes but TotalCopies is ${parsedCopies}. Barcodes count cannot exceed TotalCopies.`,
          value: barcodesStr,
        });
      }
      const rowSeenBarcodes = new Set<string>();
      for (const bc of barcodes) {
        if (bc.length > 100) {
          errors.push({
            row: rowNumber,
            column: 'Barcodes',
            message: `Barcode "${bc}" exceeds maximum length of 100 characters.`,
            value: bc,
          });
          continue;
        }
        totalBarcodes++;
        if (rowSeenBarcodes.has(bc)) {
          errors.push({
            row: rowNumber,
            column: 'Barcodes',
            message: `Duplicate barcode "${bc}" within row ${rowNumber}.`,
            value: bc,
          });
        } else {
          rowSeenBarcodes.add(bc);
        }

        if (seenBarcodes.has(bc)) {
          const firstSeen = seenBarcodes.get(bc)!;
          errors.push({
            row: rowNumber,
            column: 'Barcodes',
            message: `Duplicate barcode "${bc}" in file (previously declared in Row ${firstSeen}).`,
            value: bc,
          });
        } else {
          seenBarcodes.set(bc, rowNumber);
        }
      }
    }

    // Validate CopyConditions (optional, semicolon/comma delimited, case-insensitive)
    if (copyConditionsStr) {
      const conditions = copyConditionsStr.split(/[;,]/).map((c) => c.trim()).filter(Boolean);
      if (conditions.length > parsedCopies) {
        errors.push({
          row: rowNumber,
          column: 'CopyConditions',
          message: `Specified ${conditions.length} conditions but TotalCopies is ${parsedCopies}.`,
          value: copyConditionsStr,
        });
      }
      for (const cond of conditions) {
        const matching = VALID_CONDITIONS.find((vc) => vc.toLowerCase() === cond.toLowerCase());
        if (!matching) {
          errors.push({
            row: rowNumber,
            column: 'CopyConditions',
            message: `Invalid condition "${cond}". Allowed: ${VALID_CONDITIONS.join(', ')}.`,
            value: cond,
          });
        }
      }
    }

    // Validate Programs (optional, semicolon delimited PROGRAM:BRANCH or PROGRAM)
    if (programsStr) {
      const progItems = programsStr.split(';').map((p) => p.trim()).filter(Boolean);
      for (const item of progItems) {
        const [progCode] = item.split(':').map((s) => s.trim());
        if (!(VALID_PROGRAMS as readonly string[]).includes(progCode.toUpperCase())) {
          errors.push({
            row: rowNumber,
            column: 'Programs',
            message: `Invalid program "${progCode}". Allowed: ${VALID_PROGRAMS.join(', ')}.`,
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
