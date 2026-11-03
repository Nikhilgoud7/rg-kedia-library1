import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { JWT_SECRET } from '../config.js';

const prisma = new PrismaClient();

export interface AuthRequest extends Request {
  user?: {
    id: string;
    name: string;
    email: string;
    role: string;
    program?: string | null;
    branch?: string | null;
    mustChangePassword?: boolean;
    approvalStatus?: string;
  };
}

// Verify JWT token and attach user to request
export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    let token = req.cookies?.rg_kedia_token;

    // Fallback to Authorization header for external API clients
    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    // Fallback to query parameter for authenticated download / media requests
    if (!token && typeof req.query?.token === 'string') {
      token = req.query.token;
    }

    if (!token) {
      res.status(401).json({ error: 'Access denied. No token provided.' });
      return;
    }

    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; v?: number };

    // Require the v (tokenVersion) claim — reject legacy tokens without it
    if (decoded.v === undefined || decoded.v === null) {
      res.status(401).json({ error: 'Invalid or expired token.' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, name: true, email: true, role: true, program: true, branch: true, active: true, tokenVersion: true, mustChangePassword: true, approvalStatus: true },
    });

    if (!user || !user.active || user.approvalStatus !== 'APPROVED') {
      res.status(401).json({ error: 'User not found or deactivated.' });
      return;
    }

    // Verify token version matches — reject revoked sessions
    if (decoded.v !== user.tokenVersion) {
      res.status(401).json({ error: 'Session has been revoked.' });
      return;
    }

    req.user = user;

    // Mandatory password change enforcement (Phase 9B)
    if (user.mustChangePassword) {
      const normalizedPath = (req.originalUrl ? req.originalUrl.split('?')[0] : (req.baseUrl + req.path)).replace(/\/+$/, '');
      const isAllowed =
        (req.method === 'GET' && (normalizedPath === '/api/auth/me' || normalizedPath === '/api/user/profile')) ||
        (req.method === 'PUT' && normalizedPath === '/api/auth/change-password') ||
        (req.method === 'POST' && normalizedPath === '/api/auth/logout');

      if (!isAllowed) {
        res.status(403).json({
          error: 'Password change required. You must change your password before accessing the library system.',
          code: 'PASSWORD_CHANGE_REQUIRED',
          mustChangePassword: true,
        });
        return;
      }
    }

    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired token.' });
  }
};

// Role-based access control middleware
export const authorize = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated.' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
      return;
    }
    next();
  };
};

export default prisma;
