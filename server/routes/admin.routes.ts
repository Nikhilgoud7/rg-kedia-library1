import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma, { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { DEMO_MODE } from '../config.js';

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

    const user = await prisma.user.create({
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

    const shouldDeactivate = active === false && existingUser.active === true;

    const user = await prisma.user.update({
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
        ...(shouldDeactivate && { tokenVersion: { increment: 1 } }),
      },
      select: {
        id: true, name: true, email: true, role: true,
        rollNumber: true, program: true, branch: true,
        year: true, semester: true, phone: true, active: true,
      },
    });

    res.json({ user });
  } catch (error) {
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

    await prisma.user.update({
      where: { id: req.params.id },
      data: {
        password: hashedPassword,
        tokenVersion: { increment: 1 },
      },
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

    await prisma.user.delete({ where: { id: req.params.id } });
    res.json({ message: 'User deleted successfully.' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Server error deleting user.' });
  }
});

export default router;
