// server/lib/bulkExportService.ts — Bulk Book Export Engine with RFC 4180 & Excel Parity
import { PrismaClient, Prisma } from '@prisma/client';
import { BULK_IMPORT_COLUMNS, serializeCsv } from './bulkImportFormat.js';

export interface BulkExportFilters {
  search?: string;
  category?: string;
  segment?: string;
  program?: string;
}

export interface BulkExportResult {
  csvContent: string;
  count: number;
}

/**
 * Builds a Prisma `where` clause for book export filtering consistent with the catalog search API.
 */
export function buildBookExportWhereClause(filters: BulkExportFilters = {}): Prisma.BookWhereInput {
  const where: Prisma.BookWhereInput = {};

  if (filters.search && typeof filters.search === 'string' && filters.search.trim()) {
    const s = filters.search.trim();
    where.OR = [
      { title: { contains: s, mode: 'insensitive' } },
      { author: { contains: s, mode: 'insensitive' } },
      { isbn: { contains: s, mode: 'insensitive' } },
    ];
  }

  if (filters.category && typeof filters.category === 'string' && filters.category.trim()) {
    where.category = filters.category.trim();
  }

  if (filters.segment && typeof filters.segment === 'string' && filters.segment.trim()) {
    where.segment = filters.segment.trim();
  }

  if (filters.program && typeof filters.program === 'string' && filters.program.trim()) {
    where.bookPrograms = {
      some: {
        program: filters.program.trim().toUpperCase(),
      },
    };
  }

  return where;
}

/**
 * Generates an RFC 4180 CSV export of books with physical copies, conditions, and program mappings.
 * Formatted with UTF-8 BOM, CRLF line endings, and leading formula injection protection for Excel parity.
 */
export async function generateBooksExportCsv(
  prisma: PrismaClient,
  filters: BulkExportFilters = {}
): Promise<BulkExportResult> {
  const where = buildBookExportWhereClause(filters);

  const books = await prisma.book.findMany({
    where,
    include: {
      copies: {
        orderBy: { copyNumber: 'asc' },
      },
      bookPrograms: {
        orderBy: [{ program: 'asc' }, { branch: 'asc' }],
      },
    },
    orderBy: [{ title: 'asc' }, { id: 'asc' }],
  });

  const headerRow = [...BULK_IMPORT_COLUMNS] as string[];
  const dataRows: string[][] = [];

  for (const book of books) {
    // 1. Title
    const title = book.title || '';

    // 2. Author
    const author = book.author || '';

    // 3. ISBN
    const isbn = book.isbn || '';

    // 4. Publisher
    const publisher = book.publisher || '';

    // 5. Edition
    const edition = book.edition || '';

    // 6. PublicationYear
    const pubYear = book.publicationYear ? String(book.publicationYear) : '';

    // 7. Category
    const category = book.category || 'TEXTBOOK';

    // 8. Segment
    const segment = book.segment || '';

    // 9. Description
    const description = book.description || '';

    // 10. TotalCopies
    const totalCopies = String(book.totalCopies ?? book.copies.length ?? 1);

    // 11. ShelfLocation
    const shelfLocation = book.shelfLocation || '';

    // 12. Barcodes (semicolon/comma delimited)
    const barcodes = book.copies
      .map((c) => c.barcode)
      .filter((b): b is string => Boolean(b && b.trim()))
      .join(', ');

    // 13. CopyConditions
    const copyConditions = book.copies
      .map((c) => c.condition || 'Good')
      .join(', ');

    // 14. Programs (semicolon delimited: PROGRAM:BRANCH or PROGRAM)
    const programs = book.bookPrograms
      .map((p) => (p.branch ? `${p.program}:${p.branch}` : p.program))
      .join('; ');

    dataRows.push([
      title,
      author,
      isbn,
      publisher,
      edition,
      pubYear,
      category,
      segment,
      description,
      totalCopies,
      shelfLocation,
      barcodes,
      copyConditions,
      programs,
    ]);
  }

  // Serialize with UTF-8 BOM (\uFEFF) and formula injection protection
  const csvContent = serializeCsv([headerRow, ...dataRows], true);

  return {
    csvContent,
    count: books.length,
  };
}
