import { Router, Response } from 'express';
import prisma, { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { logAdminAction, AUDIT_ACTIONS, AuditAction } from '../lib/auditLogger.js';
import {
  calculateActualBookCounts,
  reconcileBookCounters,
  reconcileAllBookCounters,
} from '../lib/inventoryReconciliation.js';

import { generateBookImportTemplateCsv } from '../lib/bulkImportFormat.js';
import {
  validateBulkImportCsv,
  checkDatabaseDuplicates,
  MAX_IMPORT_FILE_SIZE,
} from '../lib/bulkImportValidation.js';

const router = Router();

// GET /api/books - List all books with filters
router.get('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { search, program, branch, category, segment, page = '1', limit = '20' } = req.query;

    // Reject array or object parameters
    const queryParams = [search, program, branch, category, segment, page, limit];
    for (const param of queryParams) {
      if (param !== undefined && (Array.isArray(param) || typeof param === 'object')) {
        res.status(400).json({ error: 'Invalid query parameter.' });
        return;
      }
    }

    const parsedPage = Math.max(1, parseInt(page as string, 10) || 1);
    const rawLimit = parseInt(limit as string, 10) || 20;
    const parsedLimit = Math.min(100, Math.max(1, rawLimit));
    const skip = (parsedPage - 1) * parsedLimit;

    const where: any = {};

    if (search && typeof search === 'string') {
      const trimmedSearch = search.trim().substring(0, 100);
      if (trimmedSearch.length > 0) {
        where.OR = [
          { title: { contains: trimmedSearch, mode: 'insensitive' } },
          { author: { contains: trimmedSearch, mode: 'insensitive' } },
          { isbn: { contains: trimmedSearch, mode: 'insensitive' } },
          { segment: { contains: trimmedSearch, mode: 'insensitive' } },
        ];
      }
    }

    if (category && typeof category === 'string') where.category = category;
    if (segment && typeof segment === 'string') where.segment = segment;

    if ((program && typeof program === 'string') || (branch && typeof branch === 'string')) {
      where.bookPrograms = {
        some: {
          ...(program && typeof program === 'string' ? { program } : {}),
          ...(branch && typeof branch === 'string' ? { branch } : {}),
        },
      };
    }

    const [books, total] = await Promise.all([
      prisma.book.findMany({
        where,
        include: {
          bookPrograms: true,
          copies: { select: { id: true, status: true, copyNumber: true } },
          _count: { select: { copies: true, requests: true } },
        },
        skip,
        take: parsedLimit,
        orderBy: [{ title: 'asc' }, { id: 'asc' }],
      }),
      prisma.book.count({ where }),
    ]);

    const totalPages = Math.ceil(total / parsedLimit) || 1;

    res.json({
      books,
      pagination: {
        total,
        page: parsedPage,
        limit: parsedLimit,
        totalPages,
      },
    });
  } catch (error) {
    console.error('List books error:', error);
    res.status(500).json({ error: 'Server error fetching books.' });
  }
});

// GET /api/books/stats - Book statistics
router.get('/stats', authenticate, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [totalBooks, totalCopies, issuedCopies, segments, categories] = await Promise.all([
      prisma.book.count(),
      prisma.bookCopy.count(),
      prisma.bookCopy.count({ where: { status: 'ISSUED' } }),
      prisma.book.groupBy({ by: ['segment'], _count: { id: true }, orderBy: { _count: { id: 'desc' } } }),
      prisma.book.groupBy({ by: ['category'], _count: { id: true } }),
    ]);

    const availableCopies = totalCopies - issuedCopies;

    res.json({
      totalBooks,
      totalCopies,
      issuedCopies,
      availableCopies,
      segments: segments.map((s: any) => ({ name: s.segment, count: s._count.id })),
      categories: categories.map((c: any) => ({ name: c.category, count: c._count.id })),
    });
  } catch (error) {
    console.error('Book stats error:', error);
    res.status(500).json({ error: 'Server error fetching stats.' });
  }
});

// GET /api/books/segments - List all unique segments
router.get('/segments', authenticate, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const segments = await prisma.book.groupBy({
      by: ['segment'],
      _count: { id: true },
      orderBy: { segment: 'asc' },
    });
    res.json({ segments: segments.map((s: any) => ({ name: s.segment, bookCount: s._count.id })) });
  } catch (error) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/books/import/template - Download bulk book import CSV template (Librarian only)
router.get('/import/template', authenticate, authorize('LIBRARIAN'), async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const csvContent = generateBookImportTemplateCsv();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="rg_kedia_book_import_template.csv"');
    res.setHeader('Cache-Control', 'no-store');
    res.send(csvContent);
  } catch (error) {
    console.error('Template generation error:', error);
    res.status(500).json({ error: 'Server error generating import template.' });
  }
});

// POST /api/books/import/validate - Validate bulk import CSV content without committing (Librarian only)
router.post('/import/validate', authenticate, authorize('LIBRARIAN'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { csvContent } = req.body || {};

    if (!csvContent || typeof csvContent !== 'string') {
      res.status(400).json({ error: 'CSV content is required (string payload).' });
      return;
    }

    if (Buffer.byteLength(csvContent, 'utf8') > MAX_IMPORT_FILE_SIZE) {
      res.status(400).json({ error: 'File content exceeds maximum allowed size of 5MB.' });
      return;
    }

    const validationResult = validateBulkImportCsv(csvContent);

    // If valid so far, perform read-only check for existing database duplicates
    let databaseDuplicates = { existingIsbns: [] as any[], existingBarcodes: [] as any[] };
    if (validationResult.validRows.length > 0) {
      databaseDuplicates = await checkDatabaseDuplicates(validationResult.validRows, prisma);
    }

    res.json({
      isValid: validationResult.isValid && databaseDuplicates.existingIsbns.length === 0 && databaseDuplicates.existingBarcodes.length === 0,
      validation: validationResult,
      databaseDuplicates,
    });
  } catch (error) {
    console.error('Bulk import validation error:', error);
    res.status(500).json({ error: 'Server error during bulk import validation.' });
  }
});

// POST /api/books/inventory/reconcile - Reconcile inventory counters for one or all books (Librarian only)
router.post('/inventory/reconcile', authenticate, authorize('LIBRARIAN'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { bookId } = req.body || {};

    if (bookId !== undefined && bookId !== null) {
      if (typeof bookId !== 'string' || !bookId.trim()) {
        res.status(400).json({ error: 'Invalid bookId. Must be a non-empty string.' });
        return;
      }

      const existing = await prisma.book.findUnique({
        where: { id: bookId.trim() },
        select: { id: true },
      });

      if (!existing) {
        res.status(404).json({ error: 'Book not found.' });
        return;
      }

      const result = await reconcileBookCounters(existing.id, { actorId: req.user!.id });
      res.json({
        message: 'Inventory reconciliation completed for book.',
        result,
      });
      return;
    }

    // Bulk reconciliation
    const summary = await reconcileAllBookCounters({ actorId: req.user!.id });
    res.json({
      message: 'Bulk inventory reconciliation completed.',
      summary,
    });
  } catch (error: any) {
    if (error?.status) {
      res.status(error.status).json({ error: error.error });
      return;
    }
    console.error('Inventory reconciliation error:', error);
    res.status(500).json({ error: 'Server error during inventory reconciliation.' });
  }
});

// POST /api/books/:id/reconcile - Reconcile inventory counters for a specific book (Librarian only)
router.post('/:id/reconcile', authenticate, authorize('LIBRARIAN'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const bookId = req.params.id;

    if (!bookId || typeof bookId !== 'string' || !bookId.trim()) {
      res.status(400).json({ error: 'Invalid bookId. Must be a non-empty string.' });
      return;
    }

    const existing = await prisma.book.findUnique({
      where: { id: bookId.trim() },
      select: { id: true },
    });

    if (!existing) {
      res.status(404).json({ error: 'Book not found.' });
      return;
    }

    const result = await reconcileBookCounters(existing.id, { actorId: req.user!.id });
    res.json({
      message: 'Inventory reconciliation completed for book.',
      result,
    });
  } catch (error: any) {
    if (error?.status) {
      res.status(error.status).json({ error: error.error });
      return;
    }
    console.error('Inventory reconciliation error:', error);
    res.status(500).json({ error: 'Server error during inventory reconciliation.' });
  }
});

// GET /api/books/:id - Book details
router.get('/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userRole = req.user?.role;

    let copiesInclude: any = false;

    if (userRole === 'LIBRARIAN') {
      copiesInclude = {
        include: {
          lendings: {
            where: { status: 'ISSUED' },
            include: { user: { select: { id: true, name: true, rollNumber: true, program: true, branch: true } } },
          },
        },
      };
    } else if (userRole === 'TEACHER') {
      copiesInclude = {
        include: {
          lendings: {
            where: { status: 'ISSUED' },
            include: { user: { select: { id: true, name: true, rollNumber: true } } },
          },
        },
      };
    } else {
      // STUDENT role: include copies without lendings or borrower identities
      copiesInclude = {
        select: { id: true, copyNumber: true, condition: true, status: true, barcode: true, shelfLocation: true },
      };
    }

    const book = await prisma.book.findUnique({
      where: { id: req.params.id },
      include: {
        bookPrograms: true,
        copies: copiesInclude,
      },
    });

    if (!book) {
      res.status(404).json({ error: 'Book not found.' });
      return;
    }

    res.json({ book });
  } catch (error) {
    console.error('Book detail error:', error);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/books - Add new book (Librarian only)
router.post('/', authenticate, authorize('LIBRARIAN'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      title, author, isbn, publisher, edition, publicationYear,
      category, segment, description, totalCopies, shelfLocation, programs,
    } = req.body;

    if (!title || !author || !segment) {
      res.status(400).json({ error: 'Title, author, and segment are required.' });
      return;
    }

    const copies = parseInt(totalCopies) || 1;

    const book = await prisma.$transaction(async (tx) => {
      const created = await tx.book.create({
        data: {
          title,
          author,
          isbn: isbn || null,
          publisher: publisher || null,
          edition: edition || null,
          publicationYear: publicationYear ? parseInt(publicationYear) : null,
          category: category || 'TEXTBOOK',
          segment,
          description: description || null,
          totalCopies: copies,
          availableCopies: copies,
          shelfLocation: shelfLocation || null,
          // Create individual copies
          copies: {
            create: Array.from({ length: copies }, (_, i) => ({
              copyNumber: i + 1,
              condition: 'Good',
              status: 'AVAILABLE',
            })),
          },
          // Map to programs/branches
          bookPrograms: programs && programs.length > 0
            ? {
                create: programs.map((p: { program: string; branch?: string }) => ({
                  program: p.program,
                  branch: p.branch || null,
                })),
              }
            : undefined,
        },
        include: { copies: true, bookPrograms: true },
      });

      await logAdminAction({
        actorId: req.user!.id,
        action: AUDIT_ACTIONS.BOOK_CREATED,
        targetId: created.id,
        details: {
          title: created.title,
          author: created.author,
          isbn: created.isbn,
          category: created.category,
          totalCopies: copies,
        },
        tx,
      });

      return created;
    });

    res.status(201).json({ book });
  } catch (error) {
    console.error('Create book error:', error);
    res.status(500).json({ error: 'Server error creating book.' });
  }
});

// PUT /api/books/:id - Update book (Librarian only)
router.put('/:id', authenticate, authorize('LIBRARIAN'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { title, author, isbn, publisher, edition, publicationYear, category, segment, description, shelfLocation } = req.body;

    const book = await prisma.$transaction(async (tx) => {
      const updated = await tx.book.update({
        where: { id: req.params.id },
        data: {
          ...(title && { title }),
          ...(author && { author }),
          isbn: isbn ?? undefined,
          publisher: publisher ?? undefined,
          edition: edition ?? undefined,
          publicationYear: publicationYear ? parseInt(publicationYear) : undefined,
          ...(category && { category }),
          ...(segment && { segment }),
          description: description ?? undefined,
          shelfLocation: shelfLocation ?? undefined,
        },
        include: { copies: true, bookPrograms: true },
      });

      await logAdminAction({
        actorId: req.user!.id,
        action: AUDIT_ACTIONS.BOOK_UPDATED,
        targetId: updated.id,
        details: {
          title: updated.title,
          author: updated.author,
          category: updated.category,
          segment: updated.segment,
        },
        tx,
      });

      return updated;
    });

    res.json({ book });
  } catch (error) {
    console.error('Update book error:', error);
    res.status(500).json({ error: 'Server error updating book.' });
  }
});

// DELETE /api/books/:id - Delete book (Librarian only)
router.delete('/:id', authenticate, authorize('LIBRARIAN'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const existingBook = await prisma.book.findUnique({
      where: { id: req.params.id },
    });

    if (!existingBook) {
      res.status(404).json({ error: 'Book not found.' });
      return;
    }

    // Check if any copies are currently issued
    const issuedCopies = await prisma.bookCopy.count({
      where: { bookId: req.params.id, status: 'ISSUED' },
    });

    if (issuedCopies > 0) {
      res.status(400).json({ error: `Cannot delete. ${issuedCopies} copies are currently issued.` });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.book.delete({ where: { id: req.params.id } });

      await logAdminAction({
        actorId: req.user!.id,
        action: AUDIT_ACTIONS.BOOK_DELETED,
        targetId: req.params.id,
        details: {
          title: existingBook.title,
          author: existingBook.author,
          isbn: existingBook.isbn,
        },
        tx,
      });
    });

    res.json({ message: 'Book deleted successfully.' });
  } catch (error) {
    console.error('Delete book error:', error);
    res.status(500).json({ error: 'Server error deleting book.' });
  }
});

// POST /api/books/:id/copies - Add physical copies to an existing book (Librarian only)
router.post('/:id/copies', authenticate, authorize('LIBRARIAN'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { count = 1, condition = 'Good', shelfLocation, barcode, copies } = req.body;

    const allowedConditions = ['Good', 'Fair', 'Poor', 'Damaged'];

    // Validate request payload
    const copySpecs: Array<{ barcode?: string | null; condition?: string; shelfLocation?: string | null }> = [];

    if (copies !== undefined) {
      if (!Array.isArray(copies) || copies.length === 0 || copies.length > 50) {
        res.status(400).json({ error: 'Copies must be an array of 1 to 50 items.' });
        return;
      }
      for (let i = 0; i < copies.length; i++) {
        const item = copies[i];
        if (item.condition && !allowedConditions.includes(item.condition)) {
          res.status(400).json({ error: `Invalid condition "${item.condition}" at index ${i}. Allowed: Good, Fair, Poor, Damaged.` });
          return;
        }
        copySpecs.push({
          barcode: item.barcode ? String(item.barcode).trim() : null,
          condition: item.condition || condition || 'Good',
          shelfLocation: item.shelfLocation !== undefined ? (item.shelfLocation ? String(item.shelfLocation).trim() : null) : undefined,
        });
      }
    } else {
      const parsedCount = parseInt(count as string, 10);
      if (isNaN(parsedCount) || parsedCount < 1 || parsedCount > 50) {
        res.status(400).json({ error: 'Count must be an integer between 1 and 50.' });
        return;
      }

      if (parsedCount > 1 && barcode) {
        res.status(400).json({ error: 'Cannot specify a single barcode when adding multiple copies. Provide individual barcodes in a copies array or omit for auto-generation.' });
        return;
      }

      if (condition && !allowedConditions.includes(condition)) {
        res.status(400).json({ error: 'Invalid condition. Allowed: Good, Fair, Poor, Damaged.' });
        return;
      }

      for (let i = 0; i < parsedCount; i++) {
        copySpecs.push({
          barcode: i === 0 && barcode ? String(barcode).trim() : null,
          condition: condition || 'Good',
          shelfLocation: shelfLocation !== undefined ? (shelfLocation ? String(shelfLocation).trim() : null) : undefined,
        });
      }
    }

    // Check for duplicate barcodes within the request payload itself
    const providedBarcodes = copySpecs.map((s) => s.barcode).filter((b): b is string => Boolean(b));
    const barcodeSet = new Set(providedBarcodes);
    if (barcodeSet.size !== providedBarcodes.length) {
      res.status(409).json({ error: 'Duplicate barcodes supplied in request payload.' });
      return;
    }

    const createdCopies = await prisma.$transaction(async (tx) => {
      // Advisory transaction lock on parent book to serialize copy number assignment & counter updates
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`book:${req.params.id}`}))`;

      const parentBook = await tx.book.findUnique({
        where: { id: req.params.id },
      });

      if (!parentBook) {
        throw { status: 404, error: 'Book not found.' };
      }

      // Check external barcode collisions
      if (providedBarcodes.length > 0) {
        const existingBarcode = await tx.bookCopy.findFirst({
          where: { barcode: { in: providedBarcodes } },
        });
        if (existingBarcode) {
          throw { status: 409, error: `Barcode "${existingBarcode.barcode}" is already assigned to another book copy.` };
        }
      }

      // Query current max copyNumber for this book
      const maxCopy = await tx.bookCopy.findFirst({
        where: { bookId: parentBook.id },
        orderBy: { copyNumber: 'desc' },
        select: { copyNumber: true },
      });

      let nextCopyNumber = (maxCopy?.copyNumber ?? 0) + 1;
      const inserted: any[] = [];

      for (const spec of copySpecs) {
        const copyNum = nextCopyNumber++;
        const resolvedBarcode = spec.barcode || `BC-${parentBook.id.slice(0, 8).toUpperCase()}-${copyNum}-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;
        const resolvedShelf = spec.shelfLocation !== undefined ? spec.shelfLocation : (shelfLocation ? String(shelfLocation).trim() : parentBook.shelfLocation || null);

        const newCopy = await tx.bookCopy.create({
          data: {
            bookId: parentBook.id,
            copyNumber: copyNum,
            condition: spec.condition || 'Good',
            status: 'AVAILABLE',
            barcode: resolvedBarcode,
            shelfLocation: resolvedShelf,
          },
        });

        inserted.push(newCopy);

        await logAdminAction({
          actorId: req.user!.id,
          action: AUDIT_ACTIONS.BOOK_COPY_CREATED,
          targetId: newCopy.id,
          details: {
            bookId: parentBook.id,
            bookTitle: parentBook.title,
            copyNumber: newCopy.copyNumber,
            barcode: newCopy.barcode,
            condition: newCopy.condition,
            shelfLocation: newCopy.shelfLocation,
          },
          tx,
        });
      }

      // Recalculate authoritative parent Book counters
      const actual = await calculateActualBookCounts(parentBook.id, tx);
      await tx.book.update({
        where: { id: parentBook.id },
        data: {
          totalCopies: actual.totalCopies,
          availableCopies: actual.availableCopies,
        },
      });

      return inserted;
    });

    res.status(201).json({
      copies: createdCopies,
      message: `Successfully added ${createdCopies.length} physical copy/copies.`,
    });
  } catch (error: any) {
    if (error?.status) {
      res.status(error.status).json({ error: error.error });
      return;
    }
    console.error('Create copies error:', error);
    res.status(500).json({ error: 'Server error creating physical copies.' });
  }
});

// PUT /api/books/copies/:copyId - Update physical book copy condition, status, and barcode (Librarian only)
router.put('/copies/:copyId', authenticate, authorize('LIBRARIAN'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { condition, status, barcode, shelfLocation, reactivate } = req.body;

    const allowedConditions = ['Good', 'Fair', 'Poor', 'Damaged'];
    const allowedStatuses = ['AVAILABLE', 'ISSUED', 'RESERVED', 'LOST', 'DAMAGED', 'WITHDRAWN'];

    if (condition && !allowedConditions.includes(condition)) {
      res.status(400).json({ error: `Invalid condition. Allowed: ${allowedConditions.join(', ')}.` });
      return;
    }

    if (status && !allowedStatuses.includes(status)) {
      res.status(400).json({ error: `Invalid status. Allowed: ${allowedStatuses.join(', ')}.` });
      return;
    }

    if (status === 'ISSUED') {
      res.status(400).json({
        error: 'Physical copies cannot be manually transitioned to ISSUED. Status must be updated through the lending approval/issue workflow.',
      });
      return;
    }

    const updatedCopy = await prisma.$transaction(async (tx) => {
      const copy = await tx.bookCopy.findUnique({
        where: { id: req.params.copyId },
        include: { book: true },
      });

      if (!copy) {
        throw { status: 404, error: 'Book copy not found.' };
      }

      // Lock parent book to serialize inventory counter updates
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`book:${copy.bookId}`}))`;

      // Status transition checks
      if (status && status !== copy.status) {
        // Guard 1: An actively issued copy cannot be manually set to AVAILABLE or other statuses, bypassing return flow
        if (copy.status === 'ISSUED') {
          const activeLoan = await tx.lending.findFirst({
            where: { bookCopyId: copy.id, status: 'ISSUED' },
          });
          if (activeLoan && status !== 'ISSUED') {
            throw {
              status: 400,
              error: 'Cannot change the status of an actively issued copy. Process the return or resolve the active loan first.',
            };
          }
        }

        // Guard 2: A WITHDRAWN copy cannot be accidentally restored to AVAILABLE without explicit reactivate flag
        if (copy.status === 'WITHDRAWN' && status === 'AVAILABLE' && !reactivate) {
          throw {
            status: 400,
            error: 'Withdrawn copies cannot be directly restored to AVAILABLE without explicit reactivation confirmation (reactivate: true).',
          };
        }

        // Guard 3: A LOST or DAMAGED copy cannot be restored to AVAILABLE without explicit reactivate flag and non-Damaged condition
        if ((copy.status === 'LOST' || copy.status === 'DAMAGED') && status === 'AVAILABLE') {
          if (!reactivate) {
            throw {
              status: 400,
              error: 'Reactivating a LOST or DAMAGED copy to AVAILABLE requires explicit reactivation confirmation (reactivate: true).',
            };
          }
          const effectiveCondition = condition || copy.condition;
          if (effectiveCondition === 'Damaged') {
            throw {
              status: 400,
              error: 'Cannot mark a damaged copy as AVAILABLE. Please repair or update the condition first.',
            };
          }
        }
      }

      // Check barcode uniqueness if updating barcode
      if (barcode !== undefined && barcode !== null && barcode !== '') {
        const existingBarcode = await tx.bookCopy.findFirst({
          where: { barcode, id: { not: copy.id } },
        });
        if (existingBarcode) {
          throw { status: 409, error: 'Barcode is already assigned to another book copy.' };
        }
      }

      const targetStatus = status || copy.status;

      const updated = await tx.bookCopy.update({
        where: { id: copy.id },
        data: {
          ...(condition && { condition }),
          ...(status && { status }),
          barcode: barcode === '' ? null : (barcode !== undefined ? barcode : undefined),
          shelfLocation: shelfLocation === '' ? null : (shelfLocation !== undefined ? shelfLocation : undefined),
        },
      });

      // Recalculate authoritative parent Book counters
      const actual = await calculateActualBookCounts(copy.bookId, tx);
      await tx.book.update({
        where: { id: copy.bookId },
        data: {
          totalCopies: actual.totalCopies,
          availableCopies: actual.availableCopies,
        },
      });

      let copyAuditAction: AuditAction = AUDIT_ACTIONS.BOOK_COPY_UPDATED;
      if (targetStatus === 'LOST' && copy.status !== 'LOST') {
        copyAuditAction = AUDIT_ACTIONS.BOOK_COPY_LOST;
      } else if (targetStatus === 'DAMAGED' && copy.status !== 'DAMAGED') {
        copyAuditAction = AUDIT_ACTIONS.BOOK_COPY_DAMAGED;
      }

      await logAdminAction({
        actorId: req.user!.id,
        action: copyAuditAction,
        targetId: copy.id,
        details: {
          bookId: copy.bookId,
          bookTitle: copy.book.title,
          copyNumber: copy.copyNumber,
          previousStatus: copy.status,
          newStatus: targetStatus,
          condition: condition || copy.condition,
          barcode: barcode === '' ? null : (barcode ?? copy.barcode),
          shelfLocation: shelfLocation === '' ? null : (shelfLocation ?? copy.shelfLocation),
        },
        tx,
      });

      if (copyAuditAction !== AUDIT_ACTIONS.BOOK_COPY_UPDATED) {
        await logAdminAction({
          actorId: req.user!.id,
          action: AUDIT_ACTIONS.BOOK_COPY_UPDATED,
          targetId: copy.id,
          details: {
            bookId: copy.bookId,
            bookTitle: copy.book.title,
            copyNumber: copy.copyNumber,
            previousStatus: copy.status,
            newStatus: targetStatus,
            condition: condition || copy.condition,
            barcode: barcode === '' ? null : (barcode ?? copy.barcode),
            shelfLocation: shelfLocation === '' ? null : (shelfLocation ?? copy.shelfLocation),
          },
          tx,
        });
      }

      return updated;
    });

    res.json({ copy: updatedCopy, message: 'Book copy updated successfully.' });
  } catch (error: any) {
    if (error?.status) {
      res.status(error.status).json({ error: error.error });
      return;
    }
    console.error('Update book copy error:', error);
    res.status(500).json({ error: 'Server error updating book copy.' });
  }
});

// DELETE /api/books/copies/:copyId - Delete or withdraw a physical book copy (Librarian only)
router.delete('/copies/:copyId', authenticate, authorize('LIBRARIAN'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const copy = await tx.bookCopy.findUnique({
        where: { id: req.params.copyId },
        include: { book: true },
      });

      if (!copy) {
        throw { status: 404, error: 'Book copy not found.' };
      }

      // Advisory lock on parent book
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`book:${copy.bookId}`}))`;

      // Check if reserved
      if (copy.status === 'RESERVED') {
        throw {
          status: 400,
          error: 'Cannot remove a reserved copy. Unassign or cancel the reservation first.',
        };
      }

      // Check if actively issued
      const activeLoan = await tx.lending.findFirst({
        where: { bookCopyId: copy.id, status: 'ISSUED' },
      });

      if (activeLoan || copy.status === 'ISSUED') {
        throw {
          status: 400,
          error: 'Cannot remove an actively issued copy. Return or resolve the active lending first.',
        };
      }

      // Check lending history
      const lendingHistoryCount = await tx.lending.count({
        where: { bookCopyId: copy.id },
      });

      if (lendingHistoryCount === 0) {
        // Hard-delete: No lending history exists
        await tx.bookCopy.delete({
          where: { id: copy.id },
        });

        // Reconcile parent book counters from authoritative copies
        const actual = await calculateActualBookCounts(copy.bookId, tx);
        await tx.book.update({
          where: { id: copy.bookId },
          data: {
            totalCopies: actual.totalCopies,
            availableCopies: actual.availableCopies,
          },
        });

        await logAdminAction({
          actorId: req.user!.id,
          action: AUDIT_ACTIONS.BOOK_COPY_DELETED,
          targetId: copy.id,
          details: {
            bookId: copy.bookId,
            bookTitle: copy.book.title,
            copyNumber: copy.copyNumber,
            barcode: copy.barcode,
            condition: copy.condition,
            shelfLocation: copy.shelfLocation,
          },
          tx,
        });

        return {
          action: 'DELETED',
          message: 'Book copy permanently deleted.',
          copyId: copy.id,
        };
      } else {
        // Soft-delete: Has lending history, transition to WITHDRAWN
        if (copy.status === 'WITHDRAWN') {
          throw { status: 400, error: 'Book copy is already marked as WITHDRAWN.' };
        }

        const withdrawnCopy = await tx.bookCopy.update({
          where: { id: copy.id },
          data: { status: 'WITHDRAWN' },
        });

        // Reconcile parent book counters from authoritative copies
        const actual = await calculateActualBookCounts(copy.bookId, tx);
        await tx.book.update({
          where: { id: copy.bookId },
          data: {
            totalCopies: actual.totalCopies,
            availableCopies: actual.availableCopies,
          },
        });

        await logAdminAction({
          actorId: req.user!.id,
          action: AUDIT_ACTIONS.BOOK_COPY_WITHDRAWN,
          targetId: copy.id,
          details: {
            bookId: copy.bookId,
            bookTitle: copy.book.title,
            copyNumber: copy.copyNumber,
            barcode: copy.barcode,
            lendingHistoryCount,
            previousStatus: copy.status,
          },
          tx,
        });

        return {
          action: 'WITHDRAWN',
          message: 'Book copy has historical lending records and has been withdrawn from circulation.',
          copy: withdrawnCopy,
        };
      }
    });

    res.json(result);
  } catch (error: any) {
    if (error?.status) {
      res.status(error.status).json({ error: error.error });
      return;
    }
    console.error('Delete copy error:', error);
    res.status(500).json({ error: 'Server error removing book copy.' });
  }
});

export default router;
