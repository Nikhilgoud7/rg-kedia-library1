import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { rateLimit } from 'express-rate-limit';
import prisma, { authenticate, AuthRequest } from '../middleware/auth.js';

const router = Router();

// Login rate limiting configuration: 10 attempts per IP per 15 minutes
const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_RATE_LIMIT_MAX = 10;

// Account lockout configuration: 5 failed attempts locks for 15 minutes
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const ACCOUNT_LOCKOUT_DURATION_MS = 15 * 60 * 1000;

const loginLimiter = rateLimit({
  windowMs: LOGIN_RATE_LIMIT_WINDOW_MS,
  max: LOGIN_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  statusCode: 429,
  message: { error: 'Too many login attempts from this IP. Please try again after 15 minutes.' },
});

// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res: Response): Promise<void> => {
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

    // Check account lockout status
    const now = new Date();
    if (user.lockedUntil && user.lockedUntil > now) {
      res.status(401).json({ error: 'Invalid credentials.' });
      return;
    }

    // If lockout has expired, reset expired lock state
    if (user.lockedUntil && user.lockedUntil <= now) {
      await prisma.user.update({
        where: { id: user.id },
        data: { lockedUntil: null, failedLoginAttempts: 0 },
      });
      user.lockedUntil = null;
      user.failedLoginAttempts = 0;
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      const updatedAttempts = user.failedLoginAttempts + 1;
      const shouldLock = updatedAttempts >= MAX_FAILED_LOGIN_ATTEMPTS;

      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: updatedAttempts,
          lockedUntil: shouldLock ? new Date(Date.now() + ACCOUNT_LOCKOUT_DURATION_MS) : null,
        },
      });

      res.status(401).json({ error: 'Invalid credentials.' });
      return;
    }

    // Successful login: reset failed login attempts and lockout if needed
    if (user.failedLoginAttempts > 0 || user.lockedUntil !== null) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });
    }

    // Generate JWT
    const secret = process.env.JWT_SECRET || 'default-secret';
    const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
    const token = jwt.sign({ id: user.id, v: user.tokenVersion }, secret, { expiresIn: expiresIn as any });

    // Set HttpOnly cookie
    res.cookie('rg_kedia_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // Return user info (without password, security counters, or token)
    const { password: _, failedLoginAttempts: __, lockedUntil: ___, tokenVersion: ____, ...userWithoutPassword } = user;
    res.json({
      user: userWithoutPassword,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login.' });
  }
});

// POST /api/auth/logout - Clear auth cookie and revoke session server-side
router.post('/logout', async (req: AuthRequest, res: Response): Promise<void> => {
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
  };

  try {
    // Attempt to read and verify the token to increment tokenVersion
    let token = req.cookies?.rg_kedia_token;
    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (token) {
      try {
        const secret = process.env.JWT_SECRET || 'default-secret';
        const decoded = jwt.verify(token, secret) as { id: string; v?: number };

        if (decoded.id) {
          // Increment tokenVersion to invalidate all existing JWTs for this user
          await prisma.user.update({
            where: { id: decoded.id },
            data: { tokenVersion: { increment: 1 } },
          });
        }
      } catch {
        // Token is invalid/expired — still clear the cookie below
      }
    }

    res.clearCookie('rg_kedia_token', cookieOptions);
    res.json({ message: 'Logged out successfully.' });
  } catch (error) {
    // Always clear the cookie even on unexpected errors
    res.clearCookie('rg_kedia_token', cookieOptions);
    res.json({ message: 'Logged out successfully.' });
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

    const { password: _, failedLoginAttempts: __, lockedUntil: ___, tokenVersion: ____, ...userWithoutPassword } = user;
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
      data: { password: hashedPassword, tokenVersion: { increment: 1 } },
    });

    // Clear the auth cookie — user must log in again with the new password
    res.clearCookie('rg_kedia_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });

    res.json({ message: 'Password changed successfully. Please log in again.' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Server error changing password.' });
  }
});

export default router;
