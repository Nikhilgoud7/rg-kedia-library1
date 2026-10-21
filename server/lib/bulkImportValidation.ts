// server/lib/bulkImportValidation.ts — Reusable validation engine for bulk book & copy import

import { PrismaClient } from '@prisma/client';
import { parseCsv, BULK_IMPORT_COLUMNS, BulkImportColumn } from './bulkImportFormat.js';

export const MAX_IMPORT_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
export const MAX_IMPORT_ROWS = 1000;

export const ALLOWED_CATEGORIES = ['TEXTBOOK', 'REFERENCE', 'GENERAL', 'LANGUAGE', 'JOURNAL'] as const;
export const ALLOWED_PROGRAMS = ['BCOM', 'BBA', 'BSC'] as const;
export const ALLOWED_COPY_CONDITIONS = ['Good', 'Fair', 'Poor', 'Damaged'] as const;

export interface RowValidationError {
  row: number; // 1-based data row index (row 1 is line 2 of CSV)
  column: string;
  value?: any;
  message: string;
}

export interface ParsedBookRow {
  rowNumber: number;
  title: string;
  author: string;
  isbn?: string | null;
  publisher?: string | null;
  edition?: string | null;
  publicationYear?: number | null;
  category: string;
  segment: string;
  description?: string | null;
  totalCopies: number;
  shelfLocation?: string | null;
  barcodes: string[];
  copyConditions: string[];
  programs: Array<{ program: string; branch?: string | null }>;
}

export interface ValidationSummary {
  totalRows: number;
  validRowCount: number;
  errorRowCount: number;
  totalBooks: number;
  totalPhysicalCopies: number;
  uniqueIsbns: number;
  totalBarcodes: number;
}

export interface ValidationResult {
  isValid: boolean;
  totalRows: number;
  validRows: ParsedBookRow[];
  errors: RowValidationError[];
  warnings: string[];
  summary: ValidationSummary;
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
 * Validates CSV text content and returns a detailed validation report.
 */
export function validateBulkImportCsv(csvText: string): ValidationResult {
  const errors: RowValidationError[] = [];
  const warnings: string[] = [];
  const validRows: ParsedBookRow[] = [];

  // 1. File text boundary checks
  if (!csvText || typeof csvText !== 'string' || csvText.trim().length === 0) {
    return {
      isValid: false,
      totalRows: 0,
      validRows: [],
      errors: [{ row: 0, column: 'File', message: 'The uploaded CSV file is empty.' }],
      warnings: [],
      summary: {
        totalRows: 0,
        validRowCount: 0,
        errorRowCount: 0,
        totalBooks: 0,
        totalPhysicalCopies: 0,
        uniqueIsbns: 0,
        totalBarcodes: 0,
      },
    };
  }

  const rawRows = parseCsv(csvText);
  if (rawRows.length === 0) {
    return {
      isValid: false,
      totalRows: 0,
      validRows: [],
      errors: [{ row: 0, column: 'File', message: 'No readable data rows found in CSV.' }],
      warnings: [],
      summary: {
        totalRows: 0,
        validRowCount: 0,
        errorRowCount: 0,
        totalBooks: 0,
        totalPhysicalCopies: 0,
        uniqueIsbns: 0,
        totalBarcodes: 0,
      },
    };
  }

  // 2. Header row inspection
  const headerRow = rawRows[0].map((h) => h.trim());
  const headerMap = new Map<string, number>();
  headerRow.forEach((col, idx) => {
    headerMap.set(col.toLowerCase(), idx);
  });

  const getColIdx = (colName: string): number => {
    const idx = headerMap.get(colName.toLowerCase());
    return idx !== undefined ? idx : -1;
  };

  const requiredHeaders = ['title', 'author', 'segment'];
  for (const req of requiredHeaders) {
    if (!headerMap.has(req)) {
      errors.push({
        row: 1,
        column: 'Header',
        message: `Missing required header column "${req}". Expected headers: ${BULK_IMPORT_COLUMNS.join(', ')}`,
      });
    }
  }

  if (errors.length > 0) {
    return {
      isValid: false,
      totalRows: 0,
      validRows: [],
      errors,
      warnings,
      summary: {
        totalRows: 0,
        validRowCount: 0,
        errorRowCount: 0,
        totalBooks: 0,
        totalPhysicalCopies: 0,
        uniqueIsbns: 0,
        totalBarcodes: 0,
      },
    };
  }

  const dataRows = rawRows.slice(1);
  if (dataRows.length === 0) {
    errors.push({
      row: 1,
      column: 'Data',
      message: 'CSV file contains headers but no data rows to import.',
    });
    return {
      isValid: false,
      totalRows: 0,
      validRows: [],
      errors,
      warnings,
      summary: {
        totalRows: 0,
        validRowCount: 0,
        errorRowCount: 0,
        totalBooks: 0,
        totalPhysicalCopies: 0,
        uniqueIsbns: 0,
        totalBarcodes: 0,
      },
    };
  }

  if (dataRows.length > MAX_IMPORT_ROWS) {
    errors.push({
      row: 0,
      column: 'Data',
      message: `File exceeds maximum row limit of ${MAX_IMPORT_ROWS} data rows (found ${dataRows.length} rows).`,
    });
    return {
      isValid: false,
      totalRows: dataRows.length,
      validRows: [],
      errors,
      warnings,
      summary: {
        totalRows: dataRows.length,
        validRowCount: 0,
        errorRowCount: dataRows.length,
        totalBooks: 0,
        totalPhysicalCopies: 0,
        uniqueIsbns: 0,
        totalBarcodes: 0,
      },
    };
  }

  // 3. Duplicate tracking across the file
  const seenIsbns = new Map<string, number>(); // normalizedIsbn -> rowNumber
  const seenBarcodes = new Map<string, number>(); // barcode -> rowNumber
  const rowsWithErrors = new Set<number>();

  const currentYear = new Date().getFullYear();

  // Column index lookups
  const titleIdx = getColIdx('Title');
  const authorIdx = getColIdx('Author');
  const isbnIdx = getColIdx('ISBN');
  const publisherIdx = getColIdx('Publisher');
  const editionIdx = getColIdx('Edition');
  const yearIdx = getColIdx('PublicationYear');
  const categoryIdx = getColIdx('Category');
  const segmentIdx = getColIdx('Segment');
  const descIdx = getColIdx('Description');
  const copiesIdx = getColIdx('TotalCopies');
  const shelfIdx = getColIdx('ShelfLocation');
  const barcodesIdx = getColIdx('Barcodes');
  const conditionsIdx = getColIdx('CopyConditions');
  const programsIdx = getColIdx('Programs');

  for (let r = 0; r < dataRows.length; r++) {
    const rowNumber = r + 1; // 1-based data row number
    const rowData = dataRows[r];

    const getVal = (idx: number): string => {
      if (idx === -1 || idx >= rowData.length) return '';
      return (rowData[idx] || '').trim();
    };

    let rowHasError = false;
    const addError = (column: string, message: string, value?: any) => {
      errors.push({ row: rowNumber, column, message, value });
      rowHasError = true;
      rowsWithErrors.add(rowNumber);
    };

    // Title validation (required, 1-255)
    const title = getVal(titleIdx);
    if (!title) {
      addError('Title', 'Book title is required.');
    } else if (title.length > 255) {
      addError('Title', `Title exceeds maximum length of 255 characters (length: ${title.length}).`, title);
    }

    // Author validation (required, 1-255)
    const author = getVal(authorIdx);
    if (!author) {
      addError('Author', 'Author is required.');
    } else if (author.length > 255) {
      addError('Author', `Author exceeds maximum length of 255 characters (length: ${author.length}).`, author);
    }

    // Segment validation (required in Prisma schema, 1-100)
    const segment = getVal(segmentIdx);
    if (!segment) {
      addError('Segment', 'Academic segment is required (e.g. Accounting, Statistics, Computer Science).');
    } else if (segment.length > 100) {
      addError('Segment', `Segment exceeds maximum length of 100 characters.`, segment);
    }

    // ISBN validation (optional, format & uniqueness)
    const rawIsbn = getVal(isbnIdx);
    let normalizedIsbn: string | null = null;
    if (rawIsbn) {
      if (!isValidIsbn(rawIsbn)) {
        addError('ISBN', `Invalid ISBN format "${rawIsbn}". Must be a valid 10 or 13 digit ISBN.`, rawIsbn);
      } else {
        normalizedIsbn = normalizeIsbn(rawIsbn);
        if (seenIsbns.has(normalizedIsbn)) {
          const firstSeenRow = seenIsbns.get(normalizedIsbn)!;
          addError('ISBN', `Duplicate ISBN "${rawIsbn}" in file (previously seen in Row ${firstSeenRow}).`, rawIsbn);
        } else {
          seenIsbns.set(normalizedIsbn, rowNumber);
        }
      }
    }

    // Publisher validation (optional, max 255)
    const publisher = getVal(publisherIdx) || null;
    if (publisher && publisher.length > 255) {
      addError('Publisher', 'Publisher exceeds maximum length of 255 characters.', publisher);
    }

    // Edition validation (optional, max 100)
    const edition = getVal(editionIdx) || null;
    if (edition && edition.length > 100) {
      addError('Edition', 'Edition exceeds maximum length of 100 characters.', edition);
    }

    // Publication Year validation (optional, integer 1000 to currentYear + 1)
    const rawYear = getVal(yearIdx);
    let publicationYear: number | null = null;
    if (rawYear) {
      const parsedYear = parseInt(rawYear, 10);
      if (isNaN(parsedYear) || !/^\d{4}$/.test(rawYear) || parsedYear < 1000 || parsedYear > currentYear + 1) {
        addError('PublicationYear', `Invalid publication year "${rawYear}". Must be a 4-digit year between 1000 and ${currentYear + 1}.`, rawYear);
      } else {
        publicationYear = parsedYear;
      }
    }

    // Category validation (optional, default TEXTBOOK)
    const rawCategory = getVal(categoryIdx).toUpperCase();
    let category = 'TEXTBOOK';
    if (rawCategory) {
      if (!ALLOWED_CATEGORIES.includes(rawCategory as any)) {
        addError('Category', `Invalid category "${rawCategory}". Allowed: ${ALLOWED_CATEGORIES.join(', ')}.`, rawCategory);
      } else {
        category = rawCategory;
      }
    }

    // Description validation (optional, max 2000)
    const description = getVal(descIdx) || null;
    if (description && description.length > 2000) {
      addError('Description', 'Description exceeds maximum length of 2000 characters.');
    }

    // Shelf location validation (optional, max 100)
    const shelfLocation = getVal(shelfIdx) || null;
    if (shelfLocation && shelfLocation.length > 100) {
      addError('ShelfLocation', 'Shelf location exceeds maximum length of 100 characters.', shelfLocation);
    }

    // TotalCopies validation (optional, integer 1 to 100, default 1)
    const rawCopies = getVal(copiesIdx);
    let totalCopies = 1;
    if (rawCopies) {
      const parsedCopies = parseInt(rawCopies, 10);
      if (isNaN(parsedCopies) || parsedCopies < 1 || parsedCopies > 100 || !/^\d+$/.test(rawCopies)) {
        addError('TotalCopies', `Invalid total copies "${rawCopies}". Must be an integer between 1 and 100.`, rawCopies);
      } else {
        totalCopies = parsedCopies;
      }
    }

    // Barcodes validation (optional, semicolon/comma delimited)
    const rawBarcodes = getVal(barcodesIdx);
    const barcodes: string[] = [];
    if (rawBarcodes) {
      const splitBarcodes = rawBarcodes.split(/[;,]/).map((b) => b.trim()).filter(Boolean);
      if (splitBarcodes.length > totalCopies) {
        addError(
          'Barcodes',
          `Row specifies ${splitBarcodes.length} barcodes but TotalCopies is ${totalCopies}. Barcodes count cannot exceed TotalCopies.`,
          rawBarcodes
        );
      }

      const rowSeenBarcodes = new Set<string>();
      for (const bc of splitBarcodes) {
        if (bc.length > 100) {
          addError('Barcodes', `Barcode "${bc}" exceeds maximum length of 100 characters.`, bc);
          continue;
        }
        if (rowSeenBarcodes.has(bc)) {
          addError('Barcodes', `Duplicate barcode "${bc}" within row ${rowNumber}.`, bc);
        } else {
          rowSeenBarcodes.add(bc);
        }

        if (seenBarcodes.has(bc)) {
          const prevRow = seenBarcodes.get(bc)!;
          addError('Barcodes', `Duplicate barcode "${bc}" in file (previously declared in Row ${prevRow}).`, bc);
        } else {
          seenBarcodes.set(bc, rowNumber);
        }
        barcodes.push(bc);
      }
    }

    // Copy Conditions validation (optional, semicolon/comma delimited)
    const rawConditions = getVal(conditionsIdx);
    const copyConditions: string[] = [];
    if (rawConditions) {
      const splitConditions = rawConditions.split(/[;,]/).map((c) => c.trim()).filter(Boolean);
      if (splitConditions.length > totalCopies) {
        addError(
          'CopyConditions',
          `Specified ${splitConditions.length} conditions but TotalCopies is ${totalCopies}.`,
          rawConditions
        );
      }
      for (const cond of splitConditions) {
        const matching = ALLOWED_COPY_CONDITIONS.find((ac) => ac.toLowerCase() === cond.toLowerCase());
        if (!matching) {
          addError('CopyConditions', `Invalid condition "${cond}". Allowed: ${ALLOWED_COPY_CONDITIONS.join(', ')}.`, cond);
        } else {
          copyConditions.push(matching);
        }
      }
    }

    // Programs validation (optional, semicolon delimited PROGRAM:BRANCH or PROGRAM)
    const rawPrograms = getVal(programsIdx);
    const programs: Array<{ program: string; branch?: string | null }> = [];
    if (rawPrograms) {
      const splitProgs = rawPrograms.split(';').map((p) => p.trim()).filter(Boolean);
      for (const progEntry of splitProgs) {
        const [progName, branchName] = progEntry.split(':').map((s) => s.trim());
        const upperProg = progName.toUpperCase();
        if (!ALLOWED_PROGRAMS.includes(upperProg as any)) {
          addError('Programs', `Invalid program "${progName}". Allowed: ${ALLOWED_PROGRAMS.join(', ')}.`, progName);
        } else {
          programs.push({
            program: upperProg,
            branch: branchName || null,
          });
        }
      }
    }

    if (!rowHasError) {
      validRows.push({
        rowNumber,
        title,
        author,
        isbn: normalizedIsbn,
        publisher,
        edition,
        publicationYear,
        category,
        segment,
        description,
        totalCopies,
        shelfLocation,
        barcodes,
        copyConditions,
        programs,
      });
    }
  }

  const validRowCount = validRows.length;
  const errorRowCount = rowsWithErrors.size;
  const totalPhysicalCopies = validRows.reduce((acc, r) => acc + r.totalCopies, 0);
  const totalBarcodes = validRows.reduce((acc, r) => acc + r.barcodes.length, 0);

  return {
    isValid: errors.length === 0,
    totalRows: dataRows.length,
    validRows,
    errors,
    warnings,
    summary: {
      totalRows: dataRows.length,
      validRowCount,
      errorRowCount,
      totalBooks: validRows.length,
      totalPhysicalCopies,
      uniqueIsbns: seenIsbns.size,
      totalBarcodes,
    },
  };
}

/**
 * Checks for existing database duplicates (read-only query against Prisma Book and BookCopy).
 * Does not mutate any records.
 */
export async function checkDatabaseDuplicates(
  rows: ParsedBookRow[],
  prisma: PrismaClient
): Promise<{
  existingIsbns: Array<{ isbn: string; title: string; existingBookId: string }>;
  existingBarcodes: Array<{ barcode: string; existingCopyId: string; existingBookTitle: string }>;
}> {
  const isbns = rows.map((r) => r.isbn).filter((isbn): isbn is string => Boolean(isbn));
  const barcodes = rows.flatMap((r) => r.barcodes).filter(Boolean);

  const [matchedBooks, matchedCopies] = await Promise.all([
    isbns.length > 0
      ? prisma.book.findMany({
          where: { isbn: { in: isbns } },
          select: { id: true, isbn: true, title: true },
        })
      : Promise.resolve([]),
    barcodes.length > 0
      ? prisma.bookCopy.findMany({
          where: { barcode: { in: barcodes } },
          select: { id: true, barcode: true, book: { select: { title: true } } },
        })
      : Promise.resolve([]),
  ]);

  return {
    existingIsbns: matchedBooks
      .filter((b) => Boolean(b.isbn))
      .map((b) => ({
        isbn: b.isbn as string,
        title: b.title,
        existingBookId: b.id,
      })),
    existingBarcodes: matchedCopies
      .filter((c) => Boolean(c.barcode))
      .map((c) => ({
        barcode: c.barcode as string,
        existingCopyId: c.id,
        existingBookTitle: c.book.title,
      })),
  };
}
