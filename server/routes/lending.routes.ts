import { Router, Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import prisma, { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import {
  MAX_ACTIVE_BORROWS_STUDENT,
  LOAN_PERIOD_DAYS,
  RENEWAL_DAYS,
  MAX_RENEWALS,
} from '../lib/lendingPolicy.js';
import { logAdminAction, AUDIT_ACTIONS, AuditAction } from '../lib/auditLogger.js';
import { calculateActualBookCounts } from '../lib/inventoryReconciliation.js';

const router = Router();

// Per-requester rate limit for request-return: 20 per 15 minutes (TEACHER/LIBRARIAN)
const requestReturnLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => req.user?.id || 'anonymous',
  statusCode: 429,
  message: { error: 'Too many return requests. Please try again after 15 minutes.' },
  skip: () => process.env.NODE_ENV === 'test' || process.env.ALLOW_TESTS === 'true',
});

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

    // STUDENT role policy enforcement
    if (req.user!.role === 'STUDENT') {
      const activeLendingsCount = await prisma.lending.count({
        where: { userId: req.user!.id, status: 'ISSUED' },
      });
      const pendingRequestsCount = await prisma.bookRequest.count({
        where: { userId: req.user!.id, status: 'PENDING', type: 'BORROW' },
      });

      if (activeLendingsCount + pendingRequestsCount >= MAX_ACTIVE_BORROWS_STUDENT) {
        res.status(400).json({ error: `Maximum limit of ${MAX_ACTIVE_BORROWS_STUDENT} books (borrowed + pending) reached.` });
        return;
      }

      const now = new Date();
      const hasOverdue = await prisma.lending.findFirst({
        where: {
          userId: req.user!.id,
          status: 'ISSUED',
          dueDate: { lt: now },
        },
      });

      if (hasOverdue) {
        res.status(400).json({ error: 'Cannot request new books while holding overdue items' });
        return;
      }
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

    // Race-safe creation inside transaction
    const request = await prisma.$transaction(async (tx) => {
      // PostgreSQL advisory transaction lock to serialize concurrent borrow requests for the same user and book
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`borrow:${req.user!.id}:${bookId}`}))`;

      // Portable row locking on user row for Postgres & SQLite concurrency protection
      await tx.user.update({
        where: { id: req.user!.id },
        data: { updatedAt: new Date() },
      });

      // Check if user already has a pending request for this book inside transaction
      const existingRequestTx = await tx.bookRequest.findFirst({
        where: { userId: req.user!.id, bookId, status: 'PENDING', type: 'BORROW' },
      });
      if (existingRequestTx) {
        throw { status: 400, error: 'You already have a pending request for this book.' };
      }

      const created = await tx.bookRequest.create({
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

      // Re-verify duplicate pending requests
      const dupCount = await tx.bookRequest.count({
        where: { userId: req.user!.id, bookId, status: 'PENDING', type: 'BORROW' },
      });
      if (dupCount > 1) {
        throw { status: 400, error: 'You already have a pending request for this book.' };
      }

      // Re-verify user doesn't already have an active lending for this book
      const alreadyIssuedTx = await tx.lending.findFirst({
        where: {
          userId: req.user!.id,
          status: 'ISSUED',
          bookCopy: { bookId },
        },
      });
      if (alreadyIssuedTx) {
        throw { status: 400, error: 'You already have a copy of this book.' };
      }

      // Re-verify limit for STUDENT
      if (req.user!.role === 'STUDENT') {
        const totalActive =
          (await tx.lending.count({ where: { userId: req.user!.id, status: 'ISSUED' } })) +
          (await tx.bookRequest.count({ where: { userId: req.user!.id, status: 'PENDING', type: 'BORROW' } }));
        if (totalActive > MAX_ACTIVE_BORROWS_STUDENT) {
          throw { status: 400, error: `Maximum limit of ${MAX_ACTIVE_BORROWS_STUDENT} books reached` };
        }
      }

      // Notify all active librarians of new borrow request
      const librarians = await tx.user.findMany({
        where: { role: 'LIBRARIAN', active: true },
        select: { id: true },
      });

      for (const lib of librarians) {
        await tx.notification.create({
          data: {
            userId: lib.id,
            title: 'New Borrow Request',
            message: `${req.user!.name} requested "${created.book.title}".`,
            type: 'REQUEST',
            link: '/librarian/requests',
          },
        });
      }

      return created;
    }, { maxWait: 10000, timeout: 30000 });

    res.status(201).json({ request });
  } catch (error: any) {
    if (error && error.status && error.error) {
      res.status(error.status).json({ error: error.error });
      return;
    }
    console.error('Request borrow error:', error);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/lending/request-return/:lendingId - Teacher requests a student to return early
router.post('/request-return/:lendingId', authenticate, authorize('TEACHER', 'LIBRARIAN'), requestReturnLimiter, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { message } = req.body;

    // Validate message: must be string or absent, max 300 chars
    if (message !== undefined && message !== null) {
      if (typeof message !== 'string') {
        res.status(400).json({ error: 'message must be a string.' });
        return;
      }
      if (message.length > 300) {
        res.status(400).json({ error: 'message must be 300 characters or fewer.' });
        return;
      }
    }

    const lending = await prisma.lending.findUnique({
      where: { id: req.params.lendingId },
      include: { bookCopy: { include: { book: true } }, user: true },
    });

    if (!lending || lending.status !== 'ISSUED') {
      res.status(404).json({ error: 'Active lending not found.' });
      return;
    }

    // Reject self-request: requester cannot request return of their own loan
    if (lending.userId === req.user!.id) {
      res.status(400).json({ error: 'You cannot request return of your own loan.' });
      return;
    }

    // Idempotency: if a PENDING RETURN_REQUEST already exists for this user+book, return 409
    const existing = await prisma.bookRequest.findFirst({
      where: {
        userId: lending.userId,
        bookId: lending.bookCopy.bookId,
        type: 'RETURN_REQUEST',
        status: 'PENDING',
      },
    });

    if (existing) {
      res.status(409).json({ error: 'A return request is already pending for this book.', requestId: existing.id });
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
        link: lending.user.role === 'TEACHER' ? '/teacher/borrowings' : '/student/borrowings',
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
    const rawDays = req.body.daysToReturn;
    let daysToReturn = LOAN_PERIOD_DAYS;
    if (rawDays !== undefined && rawDays !== null && rawDays !== '') {
      const parsed = parseInt(String(rawDays), 10);
      if (isNaN(parsed) || parsed < 1 || parsed > 365) {
        res.status(400).json({ error: 'Invalid daysToReturn value. Must be an integer between 1 and 365.' });
        return;
      }
      daysToReturn = parsed;
    }

    const result = await prisma.$transaction(async (tx) => {
      const request = await tx.bookRequest.findUnique({
        where: { id: req.params.requestId },
        include: { book: true, user: true },
      });

      if (!request) {
        throw { status: 404, error: 'Pending borrow request not found.' };
      }

      // PostgreSQL advisory transaction lock on the book to serialize copy allocation across concurrent approvals
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`book:${request.bookId}`}))`;

      // Conditional claim on request
      const claimedRequest = await tx.bookRequest.updateMany({
        where: { id: request.id, status: 'PENDING', type: 'BORROW' },
        data: { status: 'APPROVED', respondedById: req.user!.id },
      });

      if (claimedRequest.count === 0) {
        throw { status: 409, error: 'Request already processed' };
      }

      // Check if user already has an active loan for this book
      const alreadyIssued = await tx.lending.findFirst({
        where: {
          userId: request.userId,
          status: 'ISSUED',
          bookCopy: { bookId: request.bookId },
        },
      });

      if (alreadyIssued) {
        throw { status: 400, error: 'User already has an active loan for this book.' };
      }

      // Pick an AVAILABLE copy inside transaction and claim it
      const availableCopies = await tx.bookCopy.findMany({
        where: { bookId: request.bookId, status: 'AVAILABLE' },
      });

      let claimedCopyId: string | null = null;
      for (const copy of availableCopies) {
        const copyClaim = await tx.bookCopy.updateMany({
          where: { id: copy.id, status: 'AVAILABLE' },
          data: { status: 'ISSUED' },
        });
        if (copyClaim.count === 1) {
          claimedCopyId = copy.id;
          break;
        }
      }

      if (!claimedCopyId) {
        throw { status: 400, error: 'No copies available to issue.' };
      }

      // Conditional claim on Book.availableCopies
      const bookClaim = await tx.book.updateMany({
        where: { id: request.bookId, availableCopies: { gt: 0 } },
        data: { availableCopies: { decrement: 1 } },
      });

      if (bookClaim.count === 0) {
        throw { status: 400, error: 'No copies available to issue.' };
      }

      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + daysToReturn);

      const lending = await tx.lending.create({
        data: {
          userId: request.userId,
          bookCopyId: claimedCopyId,
          dueDate,
          issuedById: req.user!.id,
        },
      });

      await tx.notification.create({
        data: {
          userId: request.userId,
          title: 'Book Request Approved',
          message: `Your request for "${request.book.title}" has been approved. Please collect it from the library. Due date: ${dueDate.toLocaleDateString()}.`,
          type: 'APPROVAL',
          link: request.user.role === 'TEACHER' ? '/teacher/borrowings' : '/student/borrowings',
        },
      });

      await logAdminAction({
        actorId: req.user!.id,
        action: AUDIT_ACTIONS.LENDING_APPROVED,
        targetId: lending.id,
        details: {
          requestId: request.id,
          bookId: request.bookId,
          bookTitle: request.book.title,
          userId: request.userId,
          borrowerName: request.user.name,
          borrowerRollNumber: request.user.rollNumber,
          copyId: claimedCopyId,
          dueDate: dueDate.toISOString(),
          daysToReturn,
        },
        tx,
      });

      const updatedRequest = await tx.bookRequest.findUnique({
        where: { id: request.id },
        include: { book: true, user: true },
      });

      return { request: updatedRequest, lending };
    }, { maxWait: 10000, timeout: 30000 });

    res.json({ request: result.request, lending: result.lending, message: 'Book issued successfully.' });
  } catch (error: any) {
    if (error && error.status && error.error) {
      res.status(error.status).json({ error: error.error });
      return;
    }
    console.error('Approve request error:', error);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/lending/reject/:requestId - Librarian rejects a request
router.post('/reject/:requestId', authenticate, authorize('LIBRARIAN'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { reason } = req.body;

    const result = await prisma.$transaction(async (tx) => {
      const request = await tx.bookRequest.findUnique({
        where: { id: req.params.requestId },
        include: { book: true, user: true },
      });

      if (!request) {
        throw { status: 404, error: 'Pending request not found.' };
      }

      const claimed = await tx.bookRequest.updateMany({
        where: { id: request.id, status: 'PENDING' },
        data: { status: 'REJECTED', responseMessage: reason || null, respondedById: req.user!.id },
      });

      if (claimed.count === 0) {
        throw { status: 409, error: 'Request already processed' };
      }

      await tx.notification.create({
        data: {
          userId: request.userId,
          title: 'Book Request Rejected',
          message: `Your request for "${request.book.title}" was not approved. ${reason || ''}`,
          type: 'INFO',
          link: request.user.role === 'TEACHER' ? '/teacher/borrowings' : '/student/borrowings',
        },
      });

      await logAdminAction({
        actorId: req.user!.id,
        action: AUDIT_ACTIONS.LENDING_REJECTED,
        targetId: request.id,
        details: {
          requestId: request.id,
          bookId: request.bookId,
          bookTitle: request.book.title,
          userId: request.userId,
          borrowerName: request.user.name,
          borrowerRollNumber: request.user.rollNumber,
          reason: reason || null,
        },
        tx,
      });

      return await tx.bookRequest.findUnique({ where: { id: request.id } });
    }, { maxWait: 10000, timeout: 30000 });

    res.json({ request: result });
  } catch (error: any) {
    if (error && error.status && error.error) {
      res.status(error.status).json({ error: error.error });
      return;
    }
    console.error('Reject request error:', error);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/lending/return/:lendingId - Librarian marks book as returned, damaged, or lost
router.post('/return/:lendingId', authenticate, authorize('LIBRARIAN'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { resolution = 'RETURNED', condition, notes } = req.body || {};

    const allowedResolutions = ['RETURNED', 'DAMAGED', 'LOST'];
    if (!allowedResolutions.includes(resolution)) {
      res.status(400).json({ error: `Invalid resolution. Allowed: ${allowedResolutions.join(', ')}.` });
      return;
    }

    const allowedConditions = ['Good', 'Fair', 'Poor', 'Damaged'];
    if (condition !== undefined && condition !== null && condition !== '' && !allowedConditions.includes(condition)) {
      res.status(400).json({ error: `Invalid condition. Allowed: ${allowedConditions.join(', ')}.` });
      return;
    }

    if (notes !== undefined && notes !== null) {
      if (typeof notes !== 'string') {
        res.status(400).json({ error: 'Notes must be a string.' });
        return;
      }
      if (notes.length > 500) {
        res.status(400).json({ error: 'Notes cannot exceed 500 characters.' });
        return;
      }
    }
    const cleanNotes = typeof notes === 'string' && notes.trim().length > 0 ? notes.trim() : null;

    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      // PostgreSQL advisory transaction lock on the lending record
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`lending:${req.params.lendingId}`}))`;

      const lending = await tx.lending.findUnique({
        where: { id: req.params.lendingId },
        include: { bookCopy: { include: { book: true } }, user: true },
      });

      if (!lending) {
        throw { status: 404, error: 'Active lending not found.' };
      }

      if (lending.status !== 'ISSUED') {
        throw { status: 409, error: 'Book has already been returned or resolved.' };
      }

      // PostgreSQL advisory transaction lock on the parent book record
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`book:${lending.bookCopy.bookId}`}))`;

      let daysOverdue = 0;
      if (now > lending.dueDate) {
        daysOverdue = Math.ceil((now.getTime() - lending.dueDate.getTime()) / (1000 * 60 * 60 * 24));
      }

      // Claim lending atomically
      const claimedLending = await tx.lending.updateMany({
        where: { id: lending.id, status: 'ISSUED' },
        data: {
          status: 'RETURNED',
          returnedDate: now,
          fine: 0,
          notes: cleanNotes || lending.notes || null,
        },
      });

      if (claimedLending.count === 0) {
        throw { status: 409, error: 'Lending already returned or resolved.' };
      }

      // Determine copy status and condition based on resolution
      let targetCopyStatus = 'AVAILABLE';
      let targetCondition = lending.bookCopy.condition;

      if (resolution === 'LOST') {
        targetCopyStatus = 'LOST';
      } else if (resolution === 'DAMAGED') {
        targetCopyStatus = 'DAMAGED';
        targetCondition = condition || 'Damaged';
      } else {
        // Normal RETURNED
        targetCopyStatus = 'AVAILABLE';
        if (condition) {
          targetCondition = condition;
        }
      }

      const updatedCopy = await tx.bookCopy.update({
        where: { id: lending.bookCopyId },
        data: {
          status: targetCopyStatus,
          condition: targetCondition,
        },
      });

      // Authoritative parent book counter recalculation
      const actual = await calculateActualBookCounts(lending.bookCopy.bookId, tx);
      await tx.book.update({
        where: { id: lending.bookCopy.bookId },
        data: {
          totalCopies: actual.totalCopies,
          availableCopies: actual.availableCopies,
        },
      });

      // Borrower notification with explicit zero-fine policy
      let notificationTitle = 'Book Returned';
      let notificationMessage = `"${lending.bookCopy.book.title}" has been successfully returned to the library.${daysOverdue > 0 ? ` Returned ${daysOverdue} days late.` : ''}`;

      if (resolution === 'LOST') {
        notificationTitle = 'Book Reported Lost';
        notificationMessage = `"${lending.bookCopy.book.title}" has been recorded as lost. Under college policy, no monetary fines are assessed.`;
      } else if (resolution === 'DAMAGED') {
        notificationTitle = 'Book Returned Damaged';
        notificationMessage = `"${lending.bookCopy.book.title}" has been returned in damaged condition and scheduled for assessment. Under college policy, no monetary fines are assessed.`;
      }

      await tx.notification.create({
        data: {
          userId: lending.userId,
          title: notificationTitle,
          message: notificationMessage,
          type: resolution === 'RETURNED' ? 'INFO' : 'WARNING',
          link: lending.user.role === 'TEACHER' ? '/teacher/borrowings' : '/student/borrowings',
        },
      });

      // Fulfill any pending return requests for this book & student
      await tx.bookRequest.updateMany({
        where: {
          bookId: lending.bookCopy.bookId,
          userId: lending.userId,
          type: 'RETURN_REQUEST',
          status: 'PENDING',
        },
        data: { status: 'APPROVED' },
      });

      // Transactional Audit Logging
      let auditAction: AuditAction = AUDIT_ACTIONS.LENDING_RETURNED;
      if (resolution === 'LOST') {
        auditAction = AUDIT_ACTIONS.BOOK_COPY_LOST;
      } else if (resolution === 'DAMAGED') {
        auditAction = AUDIT_ACTIONS.BOOK_COPY_DAMAGED;
      }

      await logAdminAction({
        actorId: req.user!.id,
        action: auditAction,
        targetId: resolution === 'RETURNED' ? lending.id : lending.bookCopyId,
        details: {
          lendingId: lending.id,
          bookId: lending.bookCopy.bookId,
          bookTitle: lending.bookCopy.book.title,
          copyId: lending.bookCopyId,
          copyNumber: lending.bookCopy.copyNumber,
          userId: lending.userId,
          borrowerName: lending.user.name,
          borrowerRollNumber: lending.user.rollNumber,
          resolution,
          condition: targetCondition,
          notes: cleanNotes || null,
          daysOverdue,
          fine: 0,
        },
        tx,
      });

      return { daysOverdue, resolution, updatedCopy };
    }, { maxWait: 10000, timeout: 30000 });

    let successMessage = 'Book returned successfully.';
    if (result.resolution === 'LOST') {
      successMessage = 'Book loan settled as lost. Zero fine assessed.';
    } else if (result.resolution === 'DAMAGED') {
      successMessage = 'Book returned in damaged condition. Zero fine assessed.';
    }

    res.json({
      message: successMessage,
      fine: 0,
      fineMessage: null,
      resolution: result.resolution,
      copyStatus: result.updatedCopy.status,
      copy: result.updatedCopy,
    });
  } catch (error: any) {
    if (error && error.status && error.error) {
      res.status(error.status).json({ error: error.error });
      return;
    }
    console.error('Return book error:', error);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/lending/renew/:lendingId - Student/Teacher renews an active loan
router.post('/renew/:lendingId', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user!.role === 'LIBRARIAN') {
      res.status(403).json({ error: 'Access denied. Librarians cannot renew personal loans.' });
      return;
    }

    const lendingId = req.params.lendingId;
    const now = new Date();

    const lending = await prisma.lending.findUnique({
      where: { id: lendingId },
      include: {
        bookCopy: { include: { book: { select: { id: true, title: true, author: true } } } },
      },
    });

    if (!lending || lending.userId !== req.user!.id) {
      res.status(404).json({ error: 'Active lending not found.' });
      return;
    }

    if (lending.status !== 'ISSUED') {
      res.status(400).json({ error: 'Only active loans can be renewed.' });
      return;
    }

    // Check if user has ANY overdue active loans (reusing overdue policy check pattern)
    const hasOverdue = await prisma.lending.findFirst({
      where: {
        userId: req.user!.id,
        status: 'ISSUED',
        dueDate: { lt: now },
      },
    });

    if (hasOverdue) {
      res.status(400).json({ error: 'Cannot renew books while holding overdue items.' });
      return;
    }

    // Check if there is a pending return request for this book
    const pendingReturnRequest = await prisma.bookRequest.findFirst({
      where: {
        userId: req.user!.id,
        bookId: lending.bookCopy.bookId,
        type: 'RETURN_REQUEST',
        status: 'PENDING',
      },
    });

    if (pendingReturnRequest) {
      res.status(400).json({ error: 'Cannot renew a book with a pending return request.' });
      return;
    }

    if (lending.renewalCount >= MAX_RENEWALS) {
      res.status(400).json({ error: `Maximum limit of ${MAX_RENEWALS} renewal(s) reached.` });
      return;
    }

    const newDueDate = new Date(lending.dueDate);
    newDueDate.setDate(newDueDate.getDate() + RENEWAL_DAYS);

    const result = await prisma.$transaction(async (tx) => {
      // PostgreSQL advisory transaction lock on the lending record
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`lending:${lendingId}`}))`;

      const updated = await tx.lending.updateMany({
        where: {
          id: lendingId,
          userId: req.user!.id,
          status: 'ISSUED',
          dueDate: { gte: now },
          renewalCount: { lt: MAX_RENEWALS },
        },
        data: {
          dueDate: newDueDate,
          renewalCount: { increment: 1 },
        },
      });

      if (updated.count === 0) {
        throw { status: 400, error: 'Renewal failed. Loan is no longer eligible for renewal.' };
      }

      await tx.notification.create({
        data: {
          userId: req.user!.id,
          title: 'Book Loan Renewed',
          message: `"${lending.bookCopy.book.title}" loan has been extended by ${RENEWAL_DAYS} days. New due date: ${newDueDate.toLocaleDateString()}.`,
          type: 'INFO',
          link: req.user!.role === 'TEACHER' ? '/teacher/borrowings' : '/student/borrowings',
        },
      });

      return await tx.lending.findUnique({
        where: { id: lendingId },
        include: {
          bookCopy: {
            include: { book: { select: { id: true, title: true, author: true, segment: true, category: true, shelfLocation: true } } },
          },
        },
      });
    }, { maxWait: 10000, timeout: 30000 });

    res.json({
      message: `Loan renewed successfully by ${RENEWAL_DAYS} days.`,
      lending: result,
    });
  } catch (error: any) {
    if (error && error.status && error.error) {
      res.status(error.status).json({ error: error.error });
      return;
    }
    console.error('Renew loan error:', error);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/lending/my-books - Current user's borrowed books
router.get('/my-books', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pageRaw = req.query.page;
    const limitRaw = req.query.limit;
    const statusRaw = req.query.status as string | undefined;

    let page = parseInt(String(pageRaw || '1'), 10);
    if (isNaN(page) || page < 1) page = 1;

    let limit = parseInt(String(limitRaw || '20'), 10);
    if (isNaN(limit) || limit < 1) limit = 20;
    if (limit > 50) limit = 50;

    const now = new Date();
    const where: any = { userId: req.user!.id };
    if (statusRaw === 'OVERDUE') {
      where.status = 'ISSUED';
      where.dueDate = { lt: now };
    } else if (statusRaw && ['ISSUED', 'RETURNED'].includes(statusRaw)) {
      where.status = statusRaw;
    }

    const total = await prisma.lending.count({ where });

    const lendings = await prisma.lending.findMany({
      where,
      include: {
        bookCopy: {
          include: { book: { select: { id: true, title: true, author: true, segment: true, category: true, shelfLocation: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const formattedLendings = lendings.map((lending) => {
      const isReturned = lending.status === 'RETURNED';
      const isOverdue = !isReturned && now > lending.dueDate;

      let daysOverdue = 0;
      if (!isReturned && isOverdue) {
        daysOverdue = Math.ceil((now.getTime() - lending.dueDate.getTime()) / (1000 * 60 * 60 * 24));
      } else if (isReturned && lending.returnedDate && lending.returnedDate > lending.dueDate) {
        daysOverdue = Math.ceil((lending.returnedDate.getTime() - lending.dueDate.getTime()) / (1000 * 60 * 60 * 24));
      }

      return {
        ...lending,
        isOverdue,
        daysOverdue,
        fine: 0,
      };
    });

    const activeLoans = await prisma.lending.count({
      where: { userId: req.user!.id, status: 'ISSUED' },
    });

    const pendingRequests = await prisma.bookRequest.count({
      where: { userId: req.user!.id, status: 'PENDING', type: 'BORROW' },
    });

    res.json({
      lendings: formattedLendings,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
      limits: {
        maxActiveBorrows: MAX_ACTIVE_BORROWS_STUDENT,
        loanPeriodDays: LOAN_PERIOD_DAYS,
        renewalDays: RENEWAL_DAYS,
        maxRenewals: MAX_RENEWALS,
      },
      usage: {
        activeLoans,
        pendingRequests,
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/lending/my-requests - Current user's book requests
router.get('/my-requests', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pageRaw = req.query.page;
    const limitRaw = req.query.limit;
    const statusRaw = req.query.status as string | undefined;
    const typeRaw = req.query.type as string | undefined;

    let page = parseInt(String(pageRaw || '1'), 10);
    if (isNaN(page) || page < 1) page = 1;

    let limit = parseInt(String(limitRaw || '20'), 10);
    if (isNaN(limit) || limit < 1) limit = 20;
    if (limit > 50) limit = 50;

    const where: any = { userId: req.user!.id };
    if (statusRaw && ['PENDING', 'APPROVED', 'REJECTED'].includes(statusRaw)) {
      where.status = statusRaw;
    }
    if (typeRaw && ['BORROW', 'RETURN_REQUEST'].includes(typeRaw)) {
      where.type = typeRaw;
    }

    const total = await prisma.bookRequest.count({ where });

    const requests = await prisma.bookRequest.findMany({
      where,
      include: { book: { select: { id: true, title: true, author: true, category: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    res.json({
      requests,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/lending/cancel-request/:requestId - Student/Teacher cancels their own pending request
router.post('/cancel-request/:requestId', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const requestId = req.params.requestId;

    const request = await prisma.bookRequest.findUnique({
      where: { id: requestId },
    });

    if (!request || request.userId !== req.user!.id) {
      res.status(404).json({ error: 'Pending request not found.' });
      return;
    }

    // Only BORROW requests can be cancelled by the borrower; RETURN_REQUESTs are resolved by returning the book
    if (request.type !== 'BORROW') {
      res.status(403).json({ error: 'Return requests are resolved by returning the book.' });
      return;
    }

    if (request.status !== 'PENDING') {
      res.status(400).json({ error: 'Only pending requests can be cancelled.' });
      return;
    }

    const updated = await prisma.bookRequest.updateMany({
      where: {
        id: requestId,
        userId: req.user!.id,
        type: 'BORROW',
        status: 'PENDING',
      },
      data: {
        status: 'REJECTED',
        responseMessage: 'Cancelled by user',
      },
    });

    if (updated.count === 0) {
      res.status(409).json({ error: 'Request is no longer pending.' });
      return;
    }

    res.json({ message: 'Request cancelled successfully.' });
  } catch (error) {
    console.error('Cancel request error:', error);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/lending/all - All active lendings (Teacher and Librarian)
router.get('/all', authenticate, authorize('TEACHER', 'LIBRARIAN'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { program, branch, search, status, overdueOnly } = req.query;

    const where: any = {};

    if (status) {
      where.status = status as string;
    } else {
      where.status = { in: ['ISSUED', 'OVERDUE'] };
    }

    if (String(overdueOnly) === 'true') {
      where.status = 'ISSUED';
      where.dueDate = { lt: new Date() };
    }

    if (program) {
      where.user = { ...(where.user || {}), program: program as string };
    }
    if (branch) {
      where.user = { ...(where.user || {}), branch: branch as string };
    }
    if (search) {
      where.OR = [
        { user: { name: { contains: search as string, mode: 'insensitive' } } },
        { user: { rollNumber: { contains: search as string, mode: 'insensitive' } } },
        { bookCopy: { book: { title: { contains: search as string, mode: 'insensitive' } } } },
      ];
    }

    const isPaginated = req.query.page !== undefined || req.query.limit !== undefined;
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string, 10) || 20));
    const skip = (page - 1) * limit;

    const [total, lendings] = await Promise.all([
      prisma.lending.count({ where }),
      prisma.lending.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, rollNumber: true, program: true, branch: true } },
          bookCopy: {
            include: { book: { select: { id: true, title: true, author: true, segment: true } } },
          },
        },
        orderBy: { issuedDate: 'desc' },
        ...(isPaginated ? { skip, take: limit } : {}),
      }),
    ]);

    const totalPages = isPaginated ? Math.ceil(total / limit) : 1;

    res.json({
      lendings,
      pagination: {
        total,
        page: isPaginated ? page : 1,
        limit: isPaginated ? limit : total,
        totalPages,
      },
    });
  } catch (error) {
    console.error('Fetch all lendings error:', error);
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
router.get('/requests', authenticate, authorize('LIBRARIAN'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { status, type, search } = req.query;

    const where: any = {};

    if (status && status !== 'ALL') {
      where.status = status as string;
    } else if (!status) {
      where.status = 'PENDING';
    }

    if (type && type !== 'ALL') {
      where.type = type as string;
    }

    if (search) {
      where.OR = [
        { user: { name: { contains: search as string, mode: 'insensitive' } } },
        { user: { rollNumber: { contains: search as string, mode: 'insensitive' } } },
        { book: { title: { contains: search as string, mode: 'insensitive' } } },
      ];
    }

    const isPaginated = req.query.page !== undefined || req.query.limit !== undefined;
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string, 10) || 20));
    const skip = (page - 1) * limit;

    const [total, requests] = await Promise.all([
      prisma.bookRequest.count({ where }),
      prisma.bookRequest.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, rollNumber: true, program: true, branch: true } },
          book: { select: { id: true, title: true, author: true, availableCopies: true } },
        },
        orderBy: { createdAt: 'desc' },
        ...(isPaginated ? { skip, take: limit } : {}),
      }),
    ]);

    const totalPages = isPaginated ? Math.ceil(total / limit) : 1;

    res.json({
      requests,
      pagination: {
        total,
        page: isPaginated ? page : 1,
        limit: isPaginated ? limit : total,
        totalPages,
      },
    });
  } catch (error) {
    console.error('Fetch requests error:', error);
    res.status(500).json({ error: 'Server error.' });
  }
});

const lastNotifCheckMap = new Map<string, number>();

// GET /api/lending/notifications/unread-count - Lightweight unread notification count
router.get('/notifications/unread-count', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const unreadCount = await prisma.notification.count({
      where: {
        userId: req.user!.id,
        read: false,
        dismissedAt: null,
      },
    });
    res.json({ unreadCount });
  } catch (error) {
    console.error('Unread count fetch error:', error);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/lending/notifications - Current user's notifications
router.get('/notifications', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const now = new Date();

    // In-memory throttle for lazy due-soon / overdue notification creation (at most once every 10 min per user)
    const lastCheck = lastNotifCheckMap.get(userId) || 0;
    if (now.getTime() - lastCheck > 10 * 60 * 1000) {
      lastNotifCheckMap.set(userId, now.getTime());

      if (req.user!.role !== 'LIBRARIAN') {
        const activeLendings = await prisma.lending.findMany({
          where: { userId, status: 'ISSUED' },
          include: { bookCopy: { include: { book: true } } },
        });

        const userRolePath = req.user!.role === 'TEACHER' ? '/teacher/borrowings' : '/student/borrowings';

        for (const lending of activeLendings) {
          const dueDate = new Date(lending.dueDate);
          const daysLeft = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

          if (now > dueDate) {
            // Overdue notification
            const dedupeKey = `${userRolePath}?overdue=${lending.id}_${dueDate.toISOString()}`;
            const existing = await prisma.notification.findFirst({
              where: { userId, link: dedupeKey },
            });

            if (!existing) {
              const daysOverdue = Math.abs(daysLeft);
              await prisma.notification.create({
                data: {
                  userId,
                  title: 'Overdue Book Warning',
                  message: `"${lending.bookCopy.book.title}" was due on ${dueDate.toLocaleDateString()} (${daysOverdue} day(s) overdue). Please return it to the library as soon as possible.`,
                  type: 'OVERDUE',
                  link: dedupeKey,
                },
              });
            }
          } else if (daysLeft >= 0 && daysLeft <= 3) {
            // Due soon notification
            const dedupeKey = `${userRolePath}?dueSoon=${lending.id}_${dueDate.toISOString()}`;
            const existing = await prisma.notification.findFirst({
              where: { userId, link: dedupeKey },
            });

            if (!existing) {
              await prisma.notification.create({
                data: {
                  userId,
                  title: 'Book Due Soon',
                  message: `"${lending.bookCopy.book.title}" is due in ${daysLeft === 0 ? 'today' : `${daysLeft} day(s)`} (${dueDate.toLocaleDateString()}). Please return or renew your loan.`,
                  type: 'WARNING',
                  link: dedupeKey,
                },
              });
            }
          }
        }
      }
    }

    const pageRaw = req.query.page;
    const limitRaw = req.query.limit;

    let page = parseInt(String(pageRaw || '1'), 10);
    if (isNaN(page) || page < 1) page = 1;

    let limit = parseInt(String(limitRaw || '20'), 10);
    if (isNaN(limit) || limit < 1) limit = 20;
    if (limit > 50) limit = 50;

    const total = await prisma.notification.count({ where: { userId, dismissedAt: null } });
    const unreadCount = await prisma.notification.count({ where: { userId, read: false, dismissedAt: null } });

    const notifications = await prisma.notification.findMany({
      where: { userId, dismissedAt: null },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    res.json({
      notifications,
      unreadCount,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error) {
    console.error('Notifications fetch error:', error);
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/lending/notifications/clear-read - Clear read notifications
router.delete('/notifications/clear-read', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const now = new Date();

    const softDismissed = await prisma.notification.updateMany({
      where: {
        userId: req.user!.id,
        read: true,
        dismissedAt: null,
        type: { in: ['OVERDUE', 'WARNING'] },
      },
      data: { dismissedAt: now },
    });

    const hardDeleted = await prisma.notification.deleteMany({
      where: {
        userId: req.user!.id,
        read: true,
        type: { notIn: ['OVERDUE', 'WARNING'] },
      },
    });

    res.json({ message: 'Read notifications cleared.', count: softDismissed.count + hardDeleted.count });
  } catch (error) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/lending/notifications/:id - Delete a notification
router.delete('/notifications/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const notification = await prisma.notification.findUnique({
      where: { id: req.params.id },
    });

    if (!notification || notification.userId !== req.user!.id || notification.dismissedAt !== null) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }

    if (['OVERDUE', 'WARNING'].includes(notification.type)) {
      await prisma.notification.update({
        where: { id: req.params.id },
        data: { dismissedAt: new Date() },
      });
    } else {
      await prisma.notification.delete({
        where: { id: req.params.id },
      });
    }

    res.json({ message: 'Notification deleted.' });
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
      res.status(404).json({ error: 'Notification not found' });
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
