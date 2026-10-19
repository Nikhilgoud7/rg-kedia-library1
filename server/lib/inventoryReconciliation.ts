import { Prisma } from '@prisma/client';
import prisma from '../middleware/auth.js';
import { logAdminAction, AUDIT_ACTIONS } from './auditLogger.js';

export interface BookCounts {
  totalCopies: number;
  availableCopies: number;
}

export interface ReconcileResult {
  bookId: string;
  bookTitle: string;
  previousTotalCopies: number;
  correctedTotalCopies: number;
  previousAvailableCopies: number;
  correctedAvailableCopies: number;
  totalDrift: number;
  availableDrift: number;
  reconciled: boolean;
}

export interface ReconcileBatchSummary {
  booksScanned: number;
  booksReconciled: number;
  booksAlreadyConsistent: number;
  booksFailed: number;
  results: ReconcileResult[];
  errors: { bookId: string; error: string }[];
}

/**
 * Calculates authoritative physical copy counts for a book.
 * totalCopies: COUNT(BookCopy WHERE status != 'WITHDRAWN')
 * availableCopies: COUNT(BookCopy WHERE status = 'AVAILABLE')
 */
export async function calculateActualBookCounts(
  bookId: string,
  tx?: Prisma.TransactionClient
): Promise<BookCounts> {
  const db = tx || prisma;
  const [totalCopies, availableCopies] = await Promise.all([
    db.bookCopy.count({
      where: {
        bookId,
        status: { not: 'WITHDRAWN' },
      },
    }),
    db.bookCopy.count({
      where: {
        bookId,
        status: 'AVAILABLE',
      },
    }),
  ]);

  return {
    totalCopies,
    availableCopies,
  };
}

/**
 * Reconciles inventory counters for a single book.
 * Uses PostgreSQL advisory xact lock to prevent race conditions.
 * If drift exists, updates Book and records an INVENTORY_RECONCILED audit log.
 */
export async function reconcileBookCounters(
  bookId: string,
  opts?: { tx?: Prisma.TransactionClient; actorId?: string }
): Promise<ReconcileResult> {
  const executeInTx = async (tx: Prisma.TransactionClient): Promise<ReconcileResult> => {
    // Acquire PostgreSQL advisory transaction lock for this book
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`book:${bookId}`}))`;

    const book = await tx.book.findUnique({
      where: { id: bookId },
      select: { id: true, title: true, totalCopies: true, availableCopies: true },
    });

    if (!book) {
      throw { status: 404, error: 'Book not found.' };
    }

    const actual = await calculateActualBookCounts(bookId, tx);

    const totalDrift = actual.totalCopies - book.totalCopies;
    const availableDrift = actual.availableCopies - book.availableCopies;
    const hasDrift = totalDrift !== 0 || availableDrift !== 0;

    if (hasDrift) {
      await tx.book.update({
        where: { id: bookId },
        data: {
          totalCopies: actual.totalCopies,
          availableCopies: actual.availableCopies,
        },
      });

      if (opts?.actorId) {
        await logAdminAction({
          actorId: opts.actorId,
          action: AUDIT_ACTIONS.INVENTORY_RECONCILED,
          targetId: book.id,
          details: {
            bookId: book.id,
            bookTitle: book.title,
            previousTotalCopies: book.totalCopies,
            correctedTotalCopies: actual.totalCopies,
            previousAvailableCopies: book.availableCopies,
            correctedAvailableCopies: actual.availableCopies,
            totalDrift,
            availableDrift,
          },
          tx,
        });
      }
    }

    return {
      bookId: book.id,
      bookTitle: book.title,
      previousTotalCopies: book.totalCopies,
      correctedTotalCopies: actual.totalCopies,
      previousAvailableCopies: book.availableCopies,
      correctedAvailableCopies: actual.availableCopies,
      totalDrift,
      availableDrift,
      reconciled: hasDrift,
    };
  };

  if (opts?.tx) {
    return executeInTx(opts.tx);
  } else {
    return prisma.$transaction(async (tx) => executeInTx(tx));
  }
}

/**
 * Reconciles inventory counters across all books in batches.
 * Isolates transactions per book to ensure partial failures do not abort entire batch.
 */
export async function reconcileAllBookCounters(
  opts?: { batchSize?: number; actorId?: string }
): Promise<ReconcileBatchSummary> {
  const batchSize = Math.max(1, Math.min(200, opts?.batchSize || 50));
  let skip = 0;
  let hasMore = true;

  let booksScanned = 0;
  let booksReconciled = 0;
  let booksAlreadyConsistent = 0;
  let booksFailed = 0;

  const results: ReconcileResult[] = [];
  const errors: { bookId: string; error: string }[] = [];

  while (hasMore) {
    const batch = await prisma.book.findMany({
      select: { id: true },
      skip,
      take: batchSize,
      orderBy: { id: 'asc' },
    });

    if (batch.length === 0) {
      break;
    }

    for (const item of batch) {
      booksScanned++;
      try {
        const result = await reconcileBookCounters(item.id, { actorId: opts?.actorId });
        results.push(result);
        if (result.reconciled) {
          booksReconciled++;
        } else {
          booksAlreadyConsistent++;
        }
      } catch (err: any) {
        booksFailed++;
        errors.push({
          bookId: item.id,
          error: err?.message || err?.error || 'Unknown error reconciling book counters',
        });
      }
    }

    skip += batch.length;
    if (batch.length < batchSize) {
      hasMore = false;
    }
  }

  return {
    booksScanned,
    booksReconciled,
    booksAlreadyConsistent,
    booksFailed,
    results,
    errors,
  };
}
