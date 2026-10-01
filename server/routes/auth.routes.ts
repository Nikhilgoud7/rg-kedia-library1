import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma, { authenticate, AuthRequest } from '../middleware/auth.js';

const router = Router();

// POST /api/auth/login
router.post('/login', async (req, res: Response): Promise<void> => {
  try {
    const { email, rollNumber, password } = req.body;

    if (!password || (!email && !rollNumber)) {
      res.status(400).json({ error: 'Please provide email/roll number and password.' });
      return;
    }

    // Find user by email or roll number
    const user = await prisma.user.findFirst({
      where: email
        ? { email: email.toLowerCase() }
        : { rollNumber: rollNumber },
    });

    if (!user) {
      res.status(401).json({ error: 'Invalid credentials.' });
      return;
    }

    if (!user.active) {
      res.status(403).json({ error: 'Account is deactivated. Contact the librarian.' });
      return;
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      res.status(401).json({ error: 'Invalid credentials.' });
      return;
    }

    // Generate JWT
    const secret = process.env.JWT_SECRET || 'default-secret';
    const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
    const token = jwt.sign({ id: user.id }, secret, { expiresIn: expiresIn as any });

    // Return user info (without password)
    const { password: _, ...userWithoutPassword } = user;
    res.json({
      token,
      user: userWithoutPassword,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login.' });
  }
});

// POST /api/auth/register (Librarian creates accounts)
router.post('/register', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Only librarians can register new users
    if (req.user?.role !== 'LIBRARIAN') {
      res.status(403).json({ error: 'Only librarians can create accounts.' });
      return;
    }

    const { name, email, password, role, rollNumber, program, branch, year, semester, secondLanguage, phone } = req.body;

    if (!name || !email || !password || !role) {
      res.status(400).json({ error: 'Name, email, password, and role are required.' });
      return;
    }

    // Check if email already exists
    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    // Check roll number uniqueness
    if (rollNumber) {
      const existingRoll = await prisma.user.findUnique({ where: { rollNumber } });
      if (existingRoll) {
        res.status(409).json({ error: 'This roll number is already registered.' });
        return;
      }
    }

    // Hash password
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
    });

    const { password: _, ...userWithoutPassword } = user;
    res.status(201).json({ user: userWithoutPassword });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Server error during registration.' });
  }
});

// GET /api/auth/me - Get current user profile
router.get('/me', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true, name: true, email: true, role: true,
        rollNumber: true, program: true, branch: true,
        year: true, semester: true, secondLanguage: true,
        phone: true, active: true, createdAt: true,
      },
    });
    res.json({ user });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: 'Server error fetching profile.' });
  }
});

// PUT /api/auth/change-password
router.put('/change-password', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'Current and new passwords are required.' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      res.status(401).json({ error: 'Current password is incorrect.' });
      return;
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await prisma.user.update({
      where: { id: req.user!.id },
      data: { password: hashedPassword },
    });

    res.json({ message: 'Password changed successfully.' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Server error changing password.' });
  }
});

export default router;
