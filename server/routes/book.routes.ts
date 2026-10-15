import { Router, Response } from 'express';
import prisma, { authenticate, authorize, AuthRequest } from '../middleware/auth.js';

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
        select: { id: true, copyNumber: true, condition: true, status: true, barcode: true },
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

    const book = await prisma.book.create({
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

    const book = await prisma.book.update({
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

    res.json({ book });
  } catch (error) {
    console.error('Update book error:', error);
    res.status(500).json({ error: 'Server error updating book.' });
  }
});

// DELETE /api/books/:id - Delete book (Librarian only)
router.delete('/:id', authenticate, authorize('LIBRARIAN'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Check if any copies are currently issued
    const issuedCopies = await prisma.bookCopy.count({
      where: { bookId: req.params.id, status: 'ISSUED' },
    });

    if (issuedCopies > 0) {
      res.status(400).json({ error: `Cannot delete. ${issuedCopies} copies are currently issued.` });
      return;
    }

    await prisma.book.delete({ where: { id: req.params.id } });
    res.json({ message: 'Book deleted successfully.' });
  } catch (error) {
    console.error('Delete book error:', error);
    res.status(500).json({ error: 'Server error deleting book.' });
  }
});

// PUT /api/books/copies/:copyId - Update physical book copy condition, status, and barcode (Librarian only)
router.put('/copies/:copyId', authenticate, authorize('LIBRARIAN'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { condition, status, barcode } = req.body;

    const copy = await prisma.bookCopy.findUnique({
      where: { id: req.params.copyId },
      include: { book: true },
    });

    if (!copy) {
      res.status(404).json({ error: 'Book copy not found.' });
      return;
    }

    if (condition && !['Good', 'Fair', 'Poor', 'Damaged'].includes(condition)) {
      res.status(400).json({ error: 'Invalid condition. Allowed: Good, Fair, Poor, Damaged.' });
      return;
    }

    if (status && !['AVAILABLE', 'ISSUED', 'RESERVED', 'LOST', 'DAMAGED'].includes(status)) {
      res.status(400).json({ error: 'Invalid status. Allowed: AVAILABLE, ISSUED, RESERVED, LOST, DAMAGED.' });
      return;
    }

    // Check barcode uniqueness if updating barcode
    if (barcode !== undefined && barcode !== null && barcode !== '') {
      const existingBarcode = await prisma.bookCopy.findFirst({
        where: { barcode, id: { not: req.params.copyId } },
      });
      if (existingBarcode) {
        res.status(409).json({ error: 'Barcode is already assigned to another book copy.' });
        return;
      }
    }

    // Inventory count synchronization
    const wasAvailable = copy.status === 'AVAILABLE';
    const nowAvailable = (status || copy.status) === 'AVAILABLE';

    let availableDelta = 0;
    if (wasAvailable && !nowAvailable) availableDelta = -1;
    if (!wasAvailable && nowAvailable) availableDelta = 1;

    const updatedCopy = await prisma.$transaction(async (tx) => {
      const updated = await tx.bookCopy.update({
        where: { id: copy.id },
        data: {
          ...(condition && { condition }),
          ...(status && { status }),
          barcode: barcode === '' ? null : barcode ?? undefined,
        },
      });

      if (availableDelta !== 0) {
        await tx.book.update({
          where: { id: copy.bookId },
          data: {
            availableCopies: { increment: availableDelta },
          },
        });
      }

      return updated;
    });

    res.json({ copy: updatedCopy, message: 'Book copy updated successfully.' });
  } catch (error) {
    console.error('Update book copy error:', error);
    res.status(500).json({ error: 'Server error updating book copy.' });
  }
});

export default router;
