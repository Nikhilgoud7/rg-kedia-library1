import { Router, Response } from 'express';
import prisma, { authenticate, AuthRequest } from '../middleware/auth.js';

const router = Router();

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

export default router;
