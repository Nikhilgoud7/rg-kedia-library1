// server/lib/bulkImportService.ts — Transactional batch import execution engine

import { PrismaClient, Prisma } from '@prisma/client';
import { validateBulkImportCsv, checkDatabaseDuplicates, ParsedBookRow } from './bulkImportValidation.js';
import { logAdminAction, AUDIT_ACTIONS } from './auditLogger.js';

export interface BulkImportOptions {
  csvText: string;
  actorId: string;
  batchSize?: number;
}

export interface BulkImportSuccessResult {
  success: true;
  message: string;
  summary: {
    totalBooksImported: number;
    totalCopiesImported: number;
    totalBatches: number;
    bookIds: string[];
  };
}

export interface BulkImportErrorResult {
  success: false;
  status: number;
  error: string;
  details?: any;
  databaseDuplicates?: any;
  validation?: any;
}

export type BulkImportResult = BulkImportSuccessResult | BulkImportErrorResult;

/**
 * Splits an array into chunks of specified size.
 */
function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Executes safe transactional batch import for validated book records.
 * Uses PostgreSQL advisory locking to serialize execution.
 * Guarantees zero partial batch imports and rolls back all created records on failure.
 */
export async function executeBulkBookImport(
  prisma: PrismaClient,
  options: BulkImportOptions
): Promise<BulkImportResult> {
  const { csvText, actorId, batchSize = 50 } = options;

  // 1. Re-validate CSV content on server
  const validationResult = validateBulkImportCsv(csvText);
  if (!validationResult.isValid || validationResult.validRows.length === 0) {
    return {
      success: false,
      status: 400,
      error: 'CSV validation failed. Please correct file errors before importing.',
      validation: validationResult,
    };
  }

  // 2. Pre-flight check for database duplicates (ISBN and Barcode collisions)
  const preCheck = await checkDatabaseDuplicates(validationResult.validRows, prisma);
  if (preCheck.existingIsbns.length > 0 || preCheck.existingBarcodes.length > 0) {
    return {
      success: false,
      status: 409,
      error: 'Import rejected due to existing ISBN or physical copy barcode conflicts in database.',
      databaseDuplicates: preCheck,
      validation: validationResult,
    };
  }

  const rows = validationResult.validRows;
  const chunks = chunkArray(rows, batchSize);
  const allCreatedBookIds: string[] = [];
  let totalCopiesCreated = 0;

  try {
    // Process each batch of 50 in an isolated transaction
    for (let batchIdx = 0; batchIdx < chunks.length; batchIdx++) {
      const currentChunk = chunks[batchIdx];

      const batchResult = await prisma.$transaction(
        async (tx) => {
          // Advisory transaction lock to serialize concurrent bulk imports
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('bulk_import_books'))`;

          // Re-verify conflicts inside transaction boundary to prevent race conditions
          const batchIsbns = currentChunk.map((r) => r.isbn).filter((isbn): isbn is string => Boolean(isbn));
          const batchBarcodes = currentChunk.flatMap((r) => r.barcodes).filter(Boolean);

          if (batchIsbns.length > 0) {
            const conflictBooks = await tx.book.findMany({
              where: { isbn: { in: batchIsbns } },
              select: { id: true, isbn: true },
            });
            if (conflictBooks.length > 0) {
              throw {
                status: 409,
                message: `Concurrent conflict: ISBN "${conflictBooks[0].isbn}" was already registered by another process.`,
              };
            }
          }

          if (batchBarcodes.length > 0) {
            const conflictCopies = await tx.bookCopy.findMany({
              where: { barcode: { in: batchBarcodes } },
              select: { id: true, barcode: true },
            });
            if (conflictCopies.length > 0) {
              throw {
                status: 409,
                message: `Concurrent conflict: Barcode "${conflictCopies[0].barcode}" was already registered by another process.`,
              };
            }
          }

          const batchBookIds: string[] = [];
          let batchCopiesCount = 0;

          // Insert each book and its associated physical copies and program mappings
          for (const row of currentChunk) {
            // 1. Create parent Book
            const book = await tx.book.create({
              data: {
                title: row.title,
                author: row.author,
                isbn: row.isbn || null,
                publisher: row.publisher || null,
                edition: row.edition || null,
                publicationYear: row.publicationYear || null,
                category: row.category,
                segment: row.segment,
                description: row.description || null,
                totalCopies: row.totalCopies,
                availableCopies: row.totalCopies,
                shelfLocation: row.shelfLocation || null,
              },
            });
            batchBookIds.push(book.id);

            // 2. Create BookCopy physical instances
            for (let copyNum = 1; copyNum <= row.totalCopies; copyNum++) {
              const condition = row.copyConditions[copyNum - 1] || 'Good';
              const barcode = row.barcodes[copyNum - 1] || null;
              await tx.bookCopy.create({
                data: {
                  bookId: book.id,
                  copyNumber: copyNum,
                  condition,
                  status: 'AVAILABLE',
                  barcode,
                  shelfLocation: row.shelfLocation || null,
                },
              });
              batchCopiesCount++;
            }

            // 3. Create BookProgram curriculum mappings
            if (row.programs.length > 0) {
              for (const prog of row.programs) {
                await tx.bookProgram.create({
                  data: {
                    bookId: book.id,
                    program: prog.program,
                    branch: prog.branch || null,
                  },
                });
              }
            }
          }

          // 4. Log audit action for batch
          await logAdminAction({
            actorId,
            action: AUDIT_ACTIONS.BOOK_CREATED,
            targetId: batchBookIds[0],
            details: {
              batchImport: true,
              batchNumber: batchIdx + 1,
              totalBatches: chunks.length,
              booksImportedCount: batchBookIds.length,
              copiesImportedCount: batchCopiesCount,
              sampleTitles: currentChunk.slice(0, 3).map((b) => b.title),
            },
            tx,
          });

          return {
            bookIds: batchBookIds,
            copiesCount: batchCopiesCount,
          };
        },
        {
          timeout: 30000, // 30s timeout per batch of 50
        }
      );

      allCreatedBookIds.push(...batchResult.bookIds);
      totalCopiesCreated += batchResult.copiesCount;
    }

    return {
      success: true,
      message: `Successfully imported ${allCreatedBookIds.length} books with ${totalCopiesCreated} physical copies across ${chunks.length} batch(es).`,
      summary: {
        totalBooksImported: allCreatedBookIds.length,
        totalCopiesImported: totalCopiesCreated,
        totalBatches: chunks.length,
        bookIds: allCreatedBookIds,
      },
    };
  } catch (err: any) {
    // If a subsequent batch fails, roll back any previously committed batches from this run
    if (allCreatedBookIds.length > 0) {
      try {
        await prisma.book.deleteMany({
          where: { id: { in: allCreatedBookIds } },
        });
      } catch (cleanupErr) {
        console.error('Failed to clean up previously committed batches after import failure:', cleanupErr);
      }
    }

    const status = err?.status || 500;
    const errorMessage = err?.message || 'Server error during batch import execution.';
    return {
      success: false,
      status,
      error: errorMessage,
    };
  }
}
