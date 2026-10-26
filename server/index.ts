import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import { PORT, CLIENT_URL, TRUST_PROXY, IS_PRODUCTION, DEMO_MODE } from './config.js';
import authRoutes from './routes/auth.routes.js';
import bookRoutes from './routes/book.routes.js';
import lendingRoutes from './routes/lending.routes.js';
import examRoutes from './routes/exam.routes.js';
import adminRoutes from './routes/admin.routes.js';
import userRoutes from './routes/user.routes.js';
import reportRoutes from './routes/reportRoutes.js';
import auditRoutes from './routes/auditRoutes.js';

const prisma = new PrismaClient();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve project root directory safely across both development (server/) and production (dist/server/)
function findProjectRoot(startDir: string): string {
  let current = startDir;
  while (current !== path.parse(current).root) {
    if (fs.existsSync(path.join(current, 'package.json'))) {
      return current;
    }
    current = path.dirname(current);
  }
  return path.resolve(startDir, '..');
}

const rootDir = findProjectRoot(__dirname);

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
app.use(express.json({ limit: '6mb' }));
app.use(express.urlencoded({ extended: true, limit: '6mb' }));

// Serve uploaded files with JSON 404 fallback for missing files
const uploadsDir = path.join(rootDir, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));
app.use('/uploads', (_req, res) => {
  res.status(404).json({ error: 'File not found' });
});

// Serve college assets
app.use('/assets', express.static(path.join(rootDir, 'client', 'public')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/books', bookRoutes);
app.use('/api/lending', lendingRoutes);
app.use('/api/exam', examRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/user', userRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/audits', auditRoutes);

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

// Public application configuration endpoint (safe client metadata, no secrets)
app.get('/api/config', (_req, res) => {
  res.json({
    demoMode: DEMO_MODE,
    name: 'R.G. Kedia College Library System',
  });
});

// API 404 fallback: ensure non-existent API routes never fall through to SPA HTML
app.all('/api/*', (_req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// Serve frontend static build in production (or when client/dist exists)
const clientDist = path.join(rootDir, 'client', 'dist');
if (IS_PRODUCTION || fs.existsSync(path.join(clientDist, 'index.html'))) {
  app.use(express.static(clientDist));

  // SPA fallback for non-API routes (Express 4 wildcard)
  app.get('*', (_req, res) => {
    const indexPath = path.join(clientDist, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).send('Not Found');
    }
  });
}

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
