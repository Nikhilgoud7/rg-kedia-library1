import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma, { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { DEMO_MODE } from '../config.js';
import { logAdminAction, AUDIT_ACTIONS, AuditAction } from '../lib/auditLogger.js';

class AdminGuardError extends Error {
  statusCode: number;
  constructor(message: string) {
    super(message);
    this.name = 'AdminGuardError';
    this.statusCode = 400;
  }
}

const router = Router();

// GET /api/admin/dashboard - Dashboard statistics
router.get('/dashboard', authenticate, authorize('LIBRARIAN'), async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const now = new Date();

    const [
      totalBooks, totalCopies, issuedCopies, totalUsers,
      totalStudents, totalTeachers, pendingRequests, overdueCount,
      recentLendings, todayIssued,
    ] = await Promise.all([
      prisma.book.count(),
      prisma.bookCopy.count(),
      prisma.bookCopy.count({ where: { status: 'ISSUED' } }),
      prisma.user.count({ where: { active: true } }),
      prisma.user.count({ where: { role: 'STUDENT', active: true } }),
      prisma.user.count({ where: { role: 'TEACHER', active: true } }),
      prisma.bookRequest.count({ where: { status: 'PENDING' } }),
      prisma.lending.count({ where: { status: 'ISSUED', dueDate: { lt: now } } }),
      prisma.lending.findMany({
        where: { status: 'ISSUED' },
        include: {
          user: { select: { name: true, rollNumber: true } },
          bookCopy: { include: { book: { select: { title: true } } } },
        },
        orderBy: { issuedDate: 'desc' },
        take: 10,
      }),
      prisma.lending.count({
        where: {
          issuedDate: {
            gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
          },
        },
      }),
    ]);

    // Books by program
    const booksByProgram = await prisma.bookProgram.groupBy({
      by: ['program'],
      _count: { id: true },
    });

    // Books by category
    const booksByCategory = await prisma.book.groupBy({
      by: ['category'],
      _count: { id: true },
    });

    res.json({
      stats: {
        totalBooks,
        totalCopies,
        issuedCopies,
        availableCopies: totalCopies - issuedCopies,
        totalUsers,
        totalStudents,
        totalTeachers,
        pendingRequests,
        overdueCount,
        todayIssued,
      },
      booksByProgram: booksByProgram.map((b: any) => ({ program: b.program, count: b._count.id })),
      booksByCategory: booksByCategory.map((b: any) => ({ category: b.category, count: b._count.id })),
      recentLendings,
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/admin/users - List all users
router.get('/users', authenticate, authorize('LIBRARIAN'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { role, program, branch, search } = req.query;

    const where: any = {};
    if (role) where.role = role;
    if (program) where.program = program;
    if (branch) where.branch = branch;
    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { email: { contains: search as string, mode: 'insensitive' } },
        { rollNumber: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true, name: true, email: true, role: true,
        rollNumber: true, program: true, branch: true,
        year: true, semester: true, secondLanguage: true,
        phone: true, active: true, createdAt: true,
        _count: { select: { lendings: true } },
      },
      orderBy: { name: 'asc' },
    });

    res.json({ users });
  } catch (error) {
    console.error('List users error:', error);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/users - Create user (Librarian only)
router.post('/users', authenticate, authorize('LIBRARIAN'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, email, password, role, rollNumber, program, branch, year, semester, secondLanguage, phone } = req.body;

    if (!name || !email || !password || !role) {
      res.status(400).json({ error: 'Name, email, password, and role are required.' });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters.' });
      return;
    }

    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) {
      res.status(409).json({ error: 'Email already exists.' });
      return;
    }

    if (rollNumber) {
      const existingRoll = await prisma.user.findUnique({ where: { rollNumber } });
      if (existingRoll) {
        res.status(409).json({ error: 'Roll number already exists.' });
        return;
      }
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name,
          email: email.toLowerCase(),
          password: hashedPassword,
          role,
          rollNumber: rollNumber || null,
          program: program || null,
          branch: branch || null,
          year: year ? parseInt(year) : null,
          semester: semester ? parseInt(semester) : null,
          secondLanguage: secondLanguage || null,
          phone: phone || null,
        },
        select: {
          id: true, name: true, email: true, role: true,
          rollNumber: true, program: true, branch: true,
          year: true, semester: true, phone: true, active: true,
        },
      });

      await logAdminAction({
        actorId: req.user!.id,
        action: AUDIT_ACTIONS.USER_CREATED,
        targetId: created.id,
        details: {
          name: created.name,
          email: created.email,
          role: created.role,
          program: created.program,
          branch: created.branch,
        },
        tx,
      });

      return created;
    });

    res.status(201).json({ user });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/admin/users/:id - Update user
router.put('/users/:id', authenticate, authorize('LIBRARIAN'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, email, role, rollNumber, program, branch, year, semester, secondLanguage, phone, active } = req.body;

    const existingUser = await prisma.user.findUnique({
      where: { id: req.params.id },
    });

    if (!existingUser) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    if (DEMO_MODE && existingUser.email.toLowerCase().endsWith('@demo.rgkedia.local')) {
      if (active === false || (role && role !== existingUser.role) || (email && email.toLowerCase() !== existingUser.email)) {
        res.status(403).json({ error: 'Modifying critical settings of demo accounts is prohibited in DEMO_MODE.' });
        return;
      }
    }

    // 1. Self-protection: Librarian cannot deactivate their own account
    if (req.params.id === req.user!.id && active === false) {
      res.status(400).json({ error: 'Cannot deactivate your own account.' });
      return;
    }

    // 2. Self-protection: Librarian cannot demote their own account
    if (req.params.id === req.user!.id && role !== undefined && role !== 'LIBRARIAN') {
      res.status(400).json({ error: 'Cannot demote your own account from LIBRARIAN role.' });
      return;
    }

    const isTargetActiveLibrarian = existingUser.role === 'LIBRARIAN' && existingUser.active === true;
    const isDeactivating = active === false && existingUser.active === true;
    const isDemoting = role !== undefined && role !== 'LIBRARIAN' && existingUser.role === 'LIBRARIAN';
    const isReducingLibrarianCapacity = isTargetActiveLibrarian && (isDeactivating || isDemoting);

    const shouldDeactivate = active === false && existingUser.active === true;
    const shouldActivate = active === true && existingUser.active === false;
    const roleChanged = role !== undefined && role !== existingUser.role;
    const shouldBumpToken = shouldDeactivate || roleChanged;

    let auditAction: AuditAction = AUDIT_ACTIONS.USER_UPDATED;
    if (shouldDeactivate) {
      auditAction = AUDIT_ACTIONS.USER_DEACTIVATED;
    } else if (shouldActivate) {
      auditAction = AUDIT_ACTIONS.USER_ACTIVATED;
    }

    const user = await prisma.$transaction(async (tx) => {
      if (isReducingLibrarianCapacity) {
        // Concurrency lock to serialize administrative librarian changes
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'admin:librarians'}))`;
        const activeLibrarians = await tx.user.count({
          where: { role: 'LIBRARIAN', active: true },
        });
        if (activeLibrarians <= 1) {
          throw new AdminGuardError('Cannot deactivate or demote the last active librarian in the system.');
        }
      }

      const updated = await tx.user.update({
        where: { id: req.params.id },
        data: {
          ...(name && { name }),
          ...(email && { email: email.toLowerCase() }),
          ...(role && { role }),
          rollNumber: rollNumber ?? undefined,
          program: program ?? undefined,
          branch: branch ?? undefined,
          year: year !== undefined ? parseInt(year) : undefined,
          semester: semester !== undefined ? parseInt(semester) : undefined,
          secondLanguage: secondLanguage ?? undefined,
          phone: phone ?? undefined,
          active: active !== undefined ? active : undefined,
          ...(shouldBumpToken && { tokenVersion: { increment: 1 } }),
        },
        select: {
          id: true, name: true, email: true, role: true,
          rollNumber: true, program: true, branch: true,
          year: true, semester: true, phone: true, active: true,
        },
      });

      await logAdminAction({
        actorId: req.user!.id,
        action: auditAction,
        targetId: updated.id,
        details: {
          name: updated.name,
          email: updated.email,
          role: updated.role,
          previousRole: existingUser.role,
          active: updated.active,
          previousActive: existingUser.active,
        },
        tx,
      });

      return updated;
    });

    res.json({ user });
  } catch (error: any) {
    if (error?.statusCode === 400 || error?.name === 'AdminGuardError') {
      res.status(400).json({ error: error.message });
      return;
    }
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/admin/users/:id/reset-password - Reset user password
router.put('/users/:id/reset-password', authenticate, authorize('LIBRARIAN'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters.' });
      return;
    }

    const targetUser = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!targetUser) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    if (DEMO_MODE && targetUser.email.toLowerCase().endsWith('@demo.rgkedia.local')) {
      res.status(403).json({ error: 'Password reset is prohibited for demo accounts in DEMO_MODE.' });
      return;
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: req.params.id },
        data: {
          password: hashedPassword,
          tokenVersion: { increment: 1 },
        },
      });

      await logAdminAction({
        actorId: req.user!.id,
        action: AUDIT_ACTIONS.PASSWORD_RESET,
        targetId: targetUser.id,
        details: {
          email: targetUser.email,
          role: targetUser.role,
        },
        tx,
      });
    });

    res.json({ message: 'Password reset successfully.' });
  } catch (error) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/admin/users/:id - Delete user (Librarian only)
router.delete('/users/:id', authenticate, authorize('LIBRARIAN'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const targetUser = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!targetUser) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    if (DEMO_MODE && targetUser.email.toLowerCase().endsWith('@demo.rgkedia.local')) {
      res.status(403).json({ error: 'Deleting demo accounts is prohibited in DEMO_MODE.' });
      return;
    }

    if (targetUser.id === req.user!.id) {
      res.status(400).json({ error: 'Cannot delete your own account.' });
      return;
    }

    const isTargetActiveLibrarian = targetUser.role === 'LIBRARIAN' && targetUser.active === true;

    await prisma.$transaction(async (tx) => {
      if (isTargetActiveLibrarian) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'admin:librarians'}))`;
        const activeLibrarians = await tx.user.count({
          where: { role: 'LIBRARIAN', active: true },
        });
        if (activeLibrarians <= 1) {
          throw new AdminGuardError('Cannot delete the last active librarian in the system.');
        }
      }

      // Institutional Audit Evidence Protection:
      // Prevent deleting users with associated institutional audit leadership, inventory scans, or corrective actions
      const [auditCount, scanCount, actionCount] = await Promise.all([
        (tx as any).libraryAudit?.count({ where: { leadLibrarianId: targetUser.id } }) ?? 0,
        (tx as any).inventoryAuditScan?.count({ where: { scannedById: targetUser.id } }) ?? 0,
        (tx as any).auditCorrectiveAction?.count({ where: { performedById: targetUser.id } }) ?? 0,
      ]);
      if (auditCount > 0 || scanCount > 0 || actionCount > 0) {
        throw new AdminGuardError(
          'Cannot delete user: user is associated with institutional audit evidence, inventory scans, or corrective action records.'
        );
      }

      await tx.user.delete({ where: { id: req.params.id } });

      await logAdminAction({
        actorId: req.user!.id,
        action: AUDIT_ACTIONS.USER_DELETED,
        targetId: targetUser.id,
        details: {
          name: targetUser.name,
          email: targetUser.email,
          role: targetUser.role,
        },
        tx,
      });
    });

    res.json({ message: 'User deleted successfully.' });
  } catch (error: any) {
    if (error?.statusCode === 400 || error?.name === 'AdminGuardError') {
      res.status(400).json({ error: error.message });
      return;
    }
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Server error deleting user.' });
  }
});

// GET /api/admin/registrations - List registration applications (Librarian only)
router.get(
  '/registrations',
  authenticate,
  authorize('LIBRARIAN'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { status, role, search } = req.query;

      const where: any = {};

      if (status && typeof status === 'string' && status !== 'ALL') {
        where.approvalStatus = status.trim().toUpperCase();
      }

      if (role && typeof role === 'string' && role !== 'ALL') {
        where.role = role.trim().toUpperCase();
      }

      if (search && typeof search === 'string') {
        const trimmed = search.trim();
        if (trimmed.length > 0) {
          where.OR = [
            { name: { contains: trimmed, mode: 'insensitive' } },
            { email: { contains: trimmed, mode: 'insensitive' } },
            { rollNumber: { contains: trimmed, mode: 'insensitive' } },
          ];
        }
      }

      const [registrations, pendingCount, approvedCount, rejectedCount] = await Promise.all([
        prisma.user.findMany({
          where,
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            rollNumber: true,
            program: true,
            branch: true,
            semester: true,
            gender: true,
            phone: true,
            approvalStatus: true,
            approvedAt: true,
            approvedById: true,
            rejectionReason: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.user.count({ where: { approvalStatus: 'PENDING' } }),
        prisma.user.count({ where: { approvalStatus: 'APPROVED' } }),
        prisma.user.count({ where: { approvalStatus: 'REJECTED' } }),
      ]);

      // Resolve approving librarian details
      const librarianIds = [...new Set(registrations.map((r) => r.approvedById).filter(Boolean))] as string[];
      let libMap = new Map<string, { id: string; name: string; email: string }>();
      if (librarianIds.length > 0) {
        const librarians = await prisma.user.findMany({
          where: { id: { in: librarianIds } },
          select: { id: true, name: true, email: true },
        });
        libMap = new Map(librarians.map((l) => [l.id, l]));
      }

      const formattedRegistrations = registrations.map((reg) => ({
        ...reg,
        approvedBy: reg.approvedById ? libMap.get(reg.approvedById) || null : null,
      }));

      res.json({
        registrations: formattedRegistrations,
        counts: {
          pending: pendingCount,
          approved: approvedCount,
          rejected: rejectedCount,
          total: pendingCount + approvedCount + rejectedCount,
        },
      });
    } catch (error) {
      console.error('List registrations error:', error);
      res.status(500).json({ error: 'Server error retrieving registration applications.' });
    }
  }
);

// PUT /api/admin/registrations/:id/approve - Approve registration application
router.put(
  '/registrations/:id/approve',
  authenticate,
  authorize('LIBRARIAN'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const targetUser = await prisma.user.findUnique({
        where: { id: req.params.id },
      });

      if (!targetUser) {
        res.status(404).json({ error: 'Registration application not found.' });
        return;
      }

      if (targetUser.approvalStatus === 'APPROVED' && targetUser.active) {
        res.status(400).json({ error: 'Registration is already approved and active.' });
        return;
      }

      const updatedUser = await prisma.$transaction(async (tx) => {
        const updated = await tx.user.update({
          where: { id: targetUser.id },
          data: {
            approvalStatus: 'APPROVED',
            active: true,
            approvedAt: new Date(),
            approvedById: req.user!.id,
            rejectionReason: null,
          },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            rollNumber: true,
            program: true,
            branch: true,
            semester: true,
            gender: true,
            approvalStatus: true,
            approvedAt: true,
            approvedById: true,
            active: true,
          },
        });

        await logAdminAction({
          actorId: req.user!.id,
          action: AUDIT_ACTIONS.USER_REGISTRATION_APPROVED,
          targetId: targetUser.id,
          details: {
            name: targetUser.name,
            email: targetUser.email,
            role: targetUser.role,
            rollNumber: targetUser.rollNumber,
          },
          tx,
        });

        return updated;
      });

      res.json({
        message: 'Registration approved successfully.',
        user: updatedUser,
      });
    } catch (error) {
      console.error('Approve registration error:', error);
      res.status(500).json({ error: 'Server error approving registration.' });
    }
  }
);

// PUT /api/admin/registrations/:id/reject - Reject registration application
router.put(
  '/registrations/:id/reject',
  authenticate,
  authorize('LIBRARIAN'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { reason } = req.body;

      const targetUser = await prisma.user.findUnique({
        where: { id: req.params.id },
      });

      if (!targetUser) {
        res.status(404).json({ error: 'Registration application not found.' });
        return;
      }

      if (DEMO_MODE && targetUser.email.toLowerCase().endsWith('@demo.rgkedia.local')) {
        res.status(403).json({ error: 'Rejecting demo accounts is prohibited in DEMO_MODE.' });
        return;
      }

      if (targetUser.role === 'LIBRARIAN') {
        res.status(400).json({ error: 'Cannot reject librarian accounts.' });
        return;
      }

      const updatedUser = await prisma.$transaction(async (tx) => {
        const updated = await tx.user.update({
          where: { id: targetUser.id },
          data: {
            approvalStatus: 'REJECTED',
            active: false,
            approvedAt: new Date(),
            approvedById: req.user!.id,
            rejectionReason: reason && typeof reason === 'string' ? reason.trim() : null,
          },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            rollNumber: true,
            program: true,
            branch: true,
            gender: true,
            approvalStatus: true,
            approvedAt: true,
            approvedById: true,
            rejectionReason: true,
            active: true,
          },
        });

        await logAdminAction({
          actorId: req.user!.id,
          action: AUDIT_ACTIONS.USER_REGISTRATION_REJECTED,
          targetId: targetUser.id,
          details: {
            name: targetUser.name,
            email: targetUser.email,
            role: targetUser.role,
            reason: reason ? String(reason).trim() : null,
          },
          tx,
        });

        return updated;
      });

      res.json({
        message: 'Registration rejected.',
        user: updatedUser,
      });
    } catch (error) {
      console.error('Reject registration error:', error);
      res.status(500).json({ error: 'Server error rejecting registration.' });
    }
  }
);

// GET /api/admin/audit-logs - List audit logs (Librarian only)
router.get(
  '/audit-logs',
  authenticate,
  authorize('LIBRARIAN'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { action, search, page = '1', limit = '20' } = req.query;

      // Reject non-string or array parameters
      const queryParams = [action, search, page, limit];
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

      if (action && typeof action === 'string') {
        where.action = action.trim();
      }

      if (search && typeof search === 'string') {
        const trimmed = search.trim().substring(0, 100);
        if (trimmed.length > 0) {
          where.OR = [
            { action: { contains: trimmed, mode: 'insensitive' } },
            { actor: { name: { contains: trimmed, mode: 'insensitive' } } },
            { actor: { email: { contains: trimmed, mode: 'insensitive' } } },
          ];
        }
      }

      const [logs, total] = await Promise.all([
        prisma.auditLog.findMany({
          where,
          include: {
            actor: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
              },
            },
          },
          orderBy: { timestamp: 'desc' },
          skip,
          take: parsedLimit,
        }),
        prisma.auditLog.count({ where }),
      ]);

      const totalPages = Math.ceil(total / parsedLimit) || 1;

      res.json({
        logs,
        pagination: {
          total,
          page: parsedPage,
          limit: parsedLimit,
          totalPages,
        },
      });
    } catch (error) {
      console.error('List audit logs error:', error);
      res.status(500).json({ error: 'Server error retrieving audit logs.' });
    }
  }
);

export default router;
