import { Router, Response } from 'express';
import prisma, { authenticate, authorize, AuthRequest } from '../middleware/auth.js';

const router = Router();

// GET /api/books - List all books with filters
router.get('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { search, program, branch, category, segment, page = '1', limit = '20' } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const where: any = {};

    if (search) {
      where.OR = [
        { title: { contains: search as string } },
        { author: { contains: search as string } },
        { isbn: { contains: search as string } },
        { segment: { contains: search as string } },
      ];
    }

    if (category) where.category = category;
    if (segment) where.segment = segment;

    // Filter by program/branch through BookProgram relation
    if (program || branch) {
      where.bookPrograms = {
        some: {
          ...(program ? { program: program as string } : {}),
          ...(branch ? { branch: branch as string } : {}),
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
        take: parseInt(limit as string),
        orderBy: { title: 'asc' },
      }),
      prisma.book.count({ where }),
    ]);

    res.json({
      books,
      pagination: {
        total,
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        totalPages: Math.ceil(total / parseInt(limit as string)),
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
    const book = await prisma.book.findUnique({
      where: { id: req.params.id },
      include: {
        bookPrograms: true,
        copies: {
          include: {
            lendings: {
              where: { status: 'ISSUED' },
              include: { user: { select: { id: true, name: true, rollNumber: true, program: true, branch: true } } },
            },
          },
        },
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

export default router;
