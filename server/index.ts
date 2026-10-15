import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import { PORT, CLIENT_URL, TRUST_PROXY } from './config.js';
import authRoutes from './routes/auth.routes.js';
import bookRoutes from './routes/book.routes.js';
import lendingRoutes from './routes/lending.routes.js';
import examRoutes from './routes/exam.routes.js';
import adminRoutes from './routes/admin.routes.js';
import userRoutes from './routes/user.routes.js';

const prisma = new PrismaClient();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Trust Proxy configuration (for reverse proxies e.g. Render, Railway, Nginx)
if (TRUST_PROXY !== undefined) {
  app.set('trust proxy', TRUST_PROXY);
}

// Middleware
app.use(cors({
  origin: CLIENT_URL,
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files with JSON 404 fallback for missing files
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
app.use('/uploads', (_req, res) => {
  res.status(404).json({ error: 'File not found' });
});

// Serve college assets
app.use('/assets', express.static(path.join(__dirname, '..', 'client', 'public')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/books', bookRoutes);
app.use('/api/lending', lendingRoutes);
app.use('/api/exam', examRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/user', userRoutes);

// Health check with database connectivity probe
app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    res.json({
      status: 'ok',
      name: 'R.G. Kedia College Library API',
      timestamp: new Date().toISOString(),
    });
  } catch {
    res.status(503).json({
      status: 'degraded',
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════════════════╗
  ║  R.G. Kedia College of Commerce                     ║
  ║  Library Management System - API Server              ║
  ║  Running on http://localhost:${PORT}                    ║
  ╚══════════════════════════════════════════════════════╝
  `);
});

export default app;
