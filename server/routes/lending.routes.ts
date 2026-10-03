import { Router, Response } from 'express';
import prisma, { authenticate, authorize, AuthRequest } from '../middleware/auth.js';

const router = Router();

// POST /api/lending/request-borrow - Student/Teacher requests to borrow a book
router.post('/request-borrow', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { bookId, message } = req.body;

    if (!bookId) {
      res.status(400).json({ error: 'Book ID is required.' });
      return;
    }

    // Check book availability
    const book = await prisma.book.findUnique({ where: { id: bookId } });
    if (!book) {
      res.status(404).json({ error: 'Book not found.' });
      return;
    }

    if (book.availableCopies <= 0) {
      res.status(400).json({ error: 'No copies available. All copies are currently issued.' });
      return;
    }

    // Check if user already has a pending request for this book
    const existingRequest = await prisma.bookRequest.findFirst({
      where: { userId: req.user!.id, bookId, status: 'PENDING', type: 'BORROW' },
    });

    if (existingRequest) {
      res.status(400).json({ error: 'You already have a pending request for this book.' });
      return;
    }

    // Check if user already has this book issued
    const alreadyIssued = await prisma.lending.findFirst({
      where: {
        userId: req.user!.id,
        status: 'ISSUED',
        bookCopy: { bookId },
      },
    });

    if (alreadyIssued) {
      res.status(400).json({ error: 'You already have a copy of this book.' });
      return;
    }

    const request = await prisma.bookRequest.create({
      data: {
        userId: req.user!.id,
        bookId,
        type: 'BORROW',
        message: message || null,
      },
      include: {
        book: { select: { title: true, author: true } },
        user: { select: { name: true, rollNumber: true } },
      },
    });

    res.status(201).json({ request });
  } catch (error) {
    console.error('Request borrow error:', error);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/lending/request-return/:lendingId - Teacher requests a student to return early
router.post('/request-return/:lendingId', authenticate, authorize('TEACHER', 'LIBRARIAN'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { message } = req.body;

    const lending = await prisma.lending.findUnique({
      where: { id: req.params.lendingId },
      include: { bookCopy: { include: { book: true } }, user: true },
    });

    if (!lending || lending.status !== 'ISSUED') {
      res.status(404).json({ error: 'Active lending not found.' });
      return;
    }

    // Create a return request
    const request = await prisma.bookRequest.create({
      data: {
        userId: lending.userId,
        bookId: lending.bookCopy.bookId,
        type: 'RETURN_REQUEST',
        message: message || `A teacher has requested you to return "${lending.bookCopy.book.title}".`,
      },
    });

    // Notify the student
    await prisma.notification.create({
      data: {
        userId: lending.userId,
        title: 'Return Request',
        message: `Please return "${lending.bookCopy.book.title}" as soon as possible. ${message || ''}`,
        type: 'REQUEST',
      },
    });

    res.json({ request, message: 'Return request sent to the student.' });
  } catch (error) {
    console.error('Request return error:', error);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/lending/approve/:requestId - Librarian approves and issues a book
router.post('/approve/:requestId', authenticate, authorize('LIBRARIAN'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { daysToReturn = 14 } = req.body;

    const request = await prisma.bookRequest.findUnique({
      where: { id: req.params.requestId },
      include: { book: true, user: true },
    });

    if (!request || request.status !== 'PENDING' || request.type !== 'BORROW') {
      res.status(404).json({ error: 'Pending borrow request not found.' });
      return;
    }

    // Find an available copy
    const availableCopy = await prisma.bookCopy.findFirst({
      where: { bookId: request.bookId, status: 'AVAILABLE' },
    });

    if (!availableCopy) {
      res.status(400).json({ error: 'No copies available to issue.' });
      return;
    }

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + parseInt(daysToReturn));

    // Transaction: approve request + issue book + update copy status + update available count
    const [updatedRequest, lending] = await prisma.$transaction([
      prisma.bookRequest.update({
        where: { id: request.id },
        data: { status: 'APPROVED', respondedById: req.user!.id },
      }),
      prisma.lending.create({
        data: {
          userId: request.userId,
          bookCopyId: availableCopy.id,
          dueDate,
          issuedById: req.user!.id,
        },
      }),
      prisma.bookCopy.update({
        where: { id: availableCopy.id },
        data: { status: 'ISSUED' },
      }),
      prisma.book.update({
        where: { id: request.bookId },
        data: { availableCopies: { decrement: 1 } },
      }),
      prisma.notification.create({
        data: {
          userId: request.userId,
          title: 'Book Request Approved',
          message: `Your request for "${request.book.title}" has been approved. Please collect it from the library. Due date: ${dueDate.toLocaleDateString()}.`,
          type: 'APPROVAL',
        },
      }),
    ]);

    res.json({ request: updatedRequest, lending, message: 'Book issued successfully.' });
  } catch (error) {
    console.error('Approve request error:', error);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/lending/reject/:requestId - Librarian rejects a request
router.post('/reject/:requestId', authenticate, authorize('LIBRARIAN'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { reason } = req.body;

    const request = await prisma.bookRequest.findUnique({
      where: { id: req.params.requestId },
      include: { book: true },
    });

    if (!request || request.status !== 'PENDING') {
      res.status(404).json({ error: 'Pending request not found.' });
      return;
    }

    const updatedRequest = await prisma.bookRequest.update({
      where: { id: request.id },
      data: { status: 'REJECTED', responseMessage: reason || null, respondedById: req.user!.id },
    });

    await prisma.notification.create({
      data: {
        userId: request.userId,
        title: 'Book Request Rejected',
        message: `Your request for "${request.book.title}" was not approved. ${reason || ''}`,
        type: 'INFO',
      },
    });

    res.json({ request: updatedRequest });
  } catch (error) {
    console.error('Reject request error:', error);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/lending/return/:lendingId - Librarian marks book as returned
router.post('/return/:lendingId', authenticate, authorize('LIBRARIAN'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const lending = await prisma.lending.findUnique({
      where: { id: req.params.lendingId },
      include: { bookCopy: { include: { book: true } } },
    });

    if (!lending || lending.status === 'RETURNED') {
      res.status(404).json({ error: 'Active lending not found.' });
      return;
    }

    // Calculate fine if overdue (₹2 per day)
    const now = new Date();
    let fine = 0;
    if (now > lending.dueDate) {
      const daysOverdue = Math.ceil((now.getTime() - lending.dueDate.getTime()) / (1000 * 60 * 60 * 24));
      fine = daysOverdue * 2; // ₹2 per day
    }

    await prisma.$transaction([
      prisma.lending.update({
        where: { id: lending.id },
        data: { status: 'RETURNED', returnedDate: now, fine },
      }),
      prisma.bookCopy.update({
        where: { id: lending.bookCopyId },
        data: { status: 'AVAILABLE' },
      }),
      prisma.book.update({
        where: { id: lending.bookCopy.bookId },
        data: { availableCopies: { increment: 1 } },
      }),
    ]);

    res.json({
      message: 'Book returned successfully.',
      fine,
      fineMessage: fine > 0 ? `Fine of ₹${fine} for ${Math.ceil(fine / 2)} days overdue.` : null,
    });
  } catch (error) {
    console.error('Return book error:', error);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/lending/my-books - Current user's borrowed books
router.get('/my-books', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const lendings = await prisma.lending.findMany({
      where: { userId: req.user!.id },
      include: {
        bookCopy: {
          include: { book: { select: { id: true, title: true, author: true, segment: true, category: true, shelfLocation: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const now = new Date();

    const formattedLendings = lendings.map((lending) => {
      const isReturned = lending.status === 'RETURNED';
      const isOverdue = !isReturned && now > lending.dueDate;

      let daysOverdue = 0;
      let calculatedFine = lending.fine; // Use recorded fine if returned

      if (!isReturned && isOverdue) {
        daysOverdue = Math.ceil((now.getTime() - lending.dueDate.getTime()) / (1000 * 60 * 60 * 24));
        calculatedFine = daysOverdue * 2; // ₹2 per day policy
      } else if (isReturned && lending.fine > 0) {
        daysOverdue = Math.ceil(lending.fine / 2);
      }

      return {
        ...lending,
        isOverdue,
        daysOverdue,
        fine: calculatedFine,
        finePolicy: '₹2 per overdue day',
      };
    });

    res.json({ lendings: formattedLendings });
  } catch (error) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/lending/my-requests - Current user's book requests
router.get('/my-requests', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const requests = await prisma.bookRequest.findMany({
      where: { userId: req.user!.id },
      include: { book: { select: { id: true, title: true, author: true } } },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ requests });
  } catch (error) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/lending/all - All active lendings (Librarian only)
router.get('/all', authenticate, authorize('LIBRARIAN'), async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const lendings = await prisma.lending.findMany({
      where: { status: { in: ['ISSUED', 'OVERDUE'] } },
      include: {
        user: { select: { id: true, name: true, rollNumber: true, program: true, branch: true } },
        bookCopy: {
          include: { book: { select: { id: true, title: true, author: true } } },
        },
      },
      orderBy: { issuedDate: 'desc' },
    });

    res.json({ lendings });
  } catch (error) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/lending/overdue - Overdue books (Librarian only)
router.get('/overdue', authenticate, authorize('LIBRARIAN'), async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const now = new Date();
    const overdue = await prisma.lending.findMany({
      where: {
        status: 'ISSUED',
        dueDate: { lt: now },
      },
      include: {
        user: { select: { id: true, name: true, rollNumber: true, phone: true, program: true, branch: true } },
        bookCopy: {
          include: { book: { select: { id: true, title: true, author: true } } },
        },
      },
      orderBy: { dueDate: 'asc' },
    });

    res.json({ overdue });
  } catch (error) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/lending/requests - Pending requests (Librarian only)
router.get('/requests', authenticate, authorize('LIBRARIAN'), async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const requests = await prisma.bookRequest.findMany({
      where: { status: 'PENDING' },
      include: {
        user: { select: { id: true, name: true, rollNumber: true, program: true, branch: true } },
        book: { select: { id: true, title: true, author: true, availableCopies: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json({ requests });
  } catch (error) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/lending/notifications - Current user's notifications
router.get('/notifications', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    res.json({ notifications });
  } catch (error) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/lending/notifications/read-all - Mark all notifications as read
router.put('/notifications/read-all', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user!.id, read: false },
      data: { read: true },
    });
    res.json({ message: 'All notifications marked as read.' });
  } catch (error) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/lending/notifications/:id/read - Mark notification as read
router.put('/notifications/:id/read', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const notification = await prisma.notification.findUnique({
      where: { id: req.params.id },
    });

    if (!notification) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }

    if (notification.userId !== req.user!.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    await prisma.notification.update({
      where: { id: req.params.id },
      data: { read: true },
    });
    res.json({ message: 'Notification marked as read.' });
  } catch (error) {
    res.status(500).json({ error: 'Server error.' });
  }
});

export default router;
