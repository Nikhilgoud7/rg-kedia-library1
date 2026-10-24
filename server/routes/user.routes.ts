import { Router, Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import prisma, { authenticate, AuthRequest } from '../middleware/auth.js';
import { logAdminAction, AUDIT_ACTIONS } from '../lib/auditLogger.js';

const router = Router();

// Rate limiter for personal data export (DSAR): 5 requests per 15 minutes per authenticated user
const dataExportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => req.user?.id || req.ip || 'anonymous',
  statusCode: 429,
  message: { error: 'Too many personal data export requests. Please try again after 15 minutes.' },
});

// Fields that students are NEVER allowed to modify through the profile API
const PROTECTED_FIELDS = [
  'id', 'email', 'password', 'role', 'rollNumber', 'program', 'branch',
  'year', 'semester', 'secondLanguage', 'active', 'createdAt', 'updatedAt',
];

// GET /api/user/profile - Returns the authenticated user's profile
router.get('/profile', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        rollNumber: true,
        program: true,
        branch: true,
        year: true,
        semester: true,
        secondLanguage: true,
        phone: true,
        active: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    res.json({ user });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Server error fetching profile.' });
  }
});

// PUT /api/user/profile - Update the authenticated user's name and/or phone
router.put('/profile', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Reject any protected fields present in the request body
    const attemptedProtected = PROTECTED_FIELDS.filter((f) => f in req.body);
    if (attemptedProtected.length > 0) {
      res.status(403).json({
        error: `You are not allowed to modify: ${attemptedProtected.join(', ')}.`,
      });
      return;
    }

    const { name, phone } = req.body;

    // Validate name
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        res.status(400).json({ error: 'Name is required and cannot be empty.' });
        return;
      }
      if (name.trim().length > 100) {
        res.status(400).json({ error: 'Name must be 100 characters or fewer.' });
        return;
      }
    }

    // Validate phone
    if (phone !== undefined && phone !== null && phone !== '') {
      if (typeof phone !== 'string') {
        res.status(400).json({ error: 'Phone must be a string.' });
        return;
      }
      // Allow digits, spaces, hyphens, plus sign, parentheses — reasonable international format
      const phoneRegex = /^[+\d][\d\s\-().]{5,19}$/;
      if (!phoneRegex.test(phone.trim())) {
        res.status(400).json({ error: 'Please enter a valid phone number (6-20 digits).' });
        return;
      }
    }

    // Build update data — only allowed fields
    const updateData: { name?: string; phone?: string | null } = {};

    if (name !== undefined) {
      updateData.name = name.trim();
    }

    if (phone !== undefined) {
      updateData.phone = phone === '' || phone === null ? null : phone.trim();
    }

    if (Object.keys(updateData).length === 0) {
      res.status(400).json({ error: 'No valid fields to update.' });
      return;
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.user!.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        rollNumber: true,
        program: true,
        branch: true,
        year: true,
        semester: true,
        secondLanguage: true,
        phone: true,
        active: true,
        createdAt: true,
        updatedAt: true,
      },
      data: updateData,
    });

    res.json({ user: updatedUser, message: 'Profile updated successfully.' });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Server error updating profile.' });
  }
});


// GET /api/user/data-export - DPDP Act 2023 Compliant Personal Data Export (DSAR)
router.get('/data-export', authenticate, dataExportLimiter, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    // Fetch user profile and related personal history in parallel
    const [user, lendings, requests, notifications, examPapers] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          rollNumber: true,
          program: true,
          branch: true,
          year: true,
          semester: true,
          secondLanguage: true,
          phone: true,
          active: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.lending.findMany({
        where: { userId },
        select: {
          id: true,
          issuedDate: true,
          dueDate: true,
          returnedDate: true,
          status: true,
          renewalCount: true,
          fine: true,
          notes: true,
          bookCopy: {
            select: {
              copyNumber: true,
              barcode: true,
              shelfLocation: true,
              book: {
                select: {
                  id: true,
                  title: true,
                  author: true,
                  isbn: true,
                  category: true,
                },
              },
            },
          },
        },
        orderBy: { issuedDate: 'desc' },
      }),
      prisma.bookRequest.findMany({
        where: { userId },
        select: {
          id: true,
          type: true,
          status: true,
          message: true,
          responseMessage: true,
          createdAt: true,
          updatedAt: true,
          book: {
            select: {
              id: true,
              title: true,
              author: true,
              isbn: true,
              category: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.notification.findMany({
        where: { userId },
        select: {
          id: true,
          title: true,
          message: true,
          type: true,
          read: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.examPaper.findMany({
        where: { uploadedById: userId },
        select: {
          id: true,
          title: true,
          subject: true,
          program: true,
          branch: true,
          year: true,
          semester: true,
          type: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    // Segregate lendings into active and historical
    const activeLoans = lendings
      .filter((l) => l.status === 'ISSUED' || l.status === 'OVERDUE')
      .map((l) => ({
        id: l.id,
        bookTitle: l.bookCopy?.book?.title || 'Unknown Title',
        bookAuthor: l.bookCopy?.book?.author || 'Unknown Author',
        isbn: l.bookCopy?.book?.isbn || null,
        category: l.bookCopy?.book?.category || null,
        barcode: l.bookCopy?.barcode || null,
        copyNumber: l.bookCopy?.copyNumber ?? null,
        shelfLocation: l.bookCopy?.shelfLocation || null,
        issuedDate: l.issuedDate,
        dueDate: l.dueDate,
        status: l.status,
        renewalCount: l.renewalCount,
        fine: 0, // Zero monetary fine college policy
        notes: l.notes,
      }));

    const historicalLoans = lendings
      .filter((l) => l.status !== 'ISSUED' && l.status !== 'OVERDUE')
      .map((l) => ({
        id: l.id,
        bookTitle: l.bookCopy?.book?.title || 'Unknown Title',
        bookAuthor: l.bookCopy?.book?.author || 'Unknown Author',
        isbn: l.bookCopy?.book?.isbn || null,
        category: l.bookCopy?.book?.category || null,
        barcode: l.bookCopy?.barcode || null,
        copyNumber: l.bookCopy?.copyNumber ?? null,
        shelfLocation: l.bookCopy?.shelfLocation || null,
        issuedDate: l.issuedDate,
        dueDate: l.dueDate,
        returnedDate: l.returnedDate,
        status: l.status,
        renewalCount: l.renewalCount,
        fine: 0,
        notes: l.notes,
      }));

    const formattedRequests = requests.map((r) => ({
      id: r.id,
      bookTitle: r.book?.title || 'Unknown Title',
      bookAuthor: r.book?.author || 'Unknown Author',
      isbn: r.book?.isbn || null,
      type: r.type,
      requestType: r.type,
      status: r.status,
      userMessage: r.message,
      librarianResponse: r.responseMessage,
      requestDate: r.createdAt,
      updatedDate: r.updatedAt,
      book: r.book,
    }));

    const exportTimestamp = new Date().toISOString();
    const exportMetadata = {
      version: '1.0',
      exportVersion: '1.0',
      complianceStandard: 'Digital Personal Data Protection Act, 2023 (DPDP Act)',
      institution: 'R.G. Kedia College of Commerce',
      dataPrincipalId: user.id,
      dataPrincipalRole: user.role,
      exportedAt: exportTimestamp,
      generatedAt: exportTimestamp,
      recordsSummary: {
        activeLoansCount: activeLoans.length,
        historicalLoansCount: historicalLoans.length,
        requestsCount: formattedRequests.length,
        notificationsCount: notifications.length,
        uploadedMaterialsCount: examPapers.length,
      },
    };

    const exportPayload = {
      metadata: exportMetadata,
      exportMetadata: exportMetadata,
      profile: user,
      activeLoans,
      historicalLoans,
      circulationHistory: {
        activeLoans,
        historicalLoans,
      },
      bookRequests: formattedRequests,
      notifications,
      ...(user.role === 'TEACHER' || user.role === 'LIBRARIAN'
        ? {
            academicMaterialsUploaded: examPapers,
            uploadedAcademicMaterials: examPapers,
          }
        : {}),
    };

    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `rg-kedia-personal-data-export-${dateStr}.json`;

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // Log personal data export event to immutable AuditLog table
    await logAdminAction({
      actorId: user.id,
      action: AUDIT_ACTIONS.DATA_EXPORT_GENERATED,
      targetId: user.id,
      details: {
        role: user.role,
        recordsSummary: exportMetadata.recordsSummary,
      },
    });

    res.status(200).json(exportPayload);
  } catch (error) {
    console.error('Personal data export error:', error);
    res.status(500).json({ error: 'Server error generating personal data export.' });
  }
});

export default router;
