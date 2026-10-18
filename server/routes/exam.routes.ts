import { Router, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import prisma, { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { logAdminAction, AUDIT_ACTIONS } from '../lib/auditLogger.js';

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

// Configure multer for file uploads
const uploadDir = path.join(rootDir, 'uploads', 'exam-papers');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, DOC, DOCX, and image files are allowed.'));
    }
  },
});

// Middleware wrapper to catch multer validation errors and return HTTP 400
const handleUpload = (req: AuthRequest, res: Response, next: NextFunction): void => {
  upload.single('file')(req, res, (err: any) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({ error: 'File size exceeds 10MB limit.' });
        return;
      }
      res.status(400).json({ error: err.message });
      return;
    } else if (err) {
      res.status(400).json({ error: err.message || 'File upload error.' });
      return;
    }
    next();
  });
};

const router = Router();

const ALLOWED_PROGRAMS = ['BCOM', 'BBA', 'BSC'];
const ALLOWED_TYPES = ['PREVIOUS_YEAR', 'IMPORTANT_QUESTIONS', 'STUDY_GUIDE'];

// GET /api/exam/papers - List exam papers with filters, search, and pagination
router.get('/papers', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { program, branch, year, semester, subject, type, search, page, limit } = req.query;

    const where: any = {};
    if (program && typeof program === 'string') where.program = program;
    if (branch && typeof branch === 'string') where.branch = branch;
    if (year) where.year = parseInt(year as string);
    if (semester) where.semester = parseInt(semester as string);
    if (type && typeof type === 'string') where.type = type;

    // Search query: if search is supplied, match across title, subject, and description
    const searchQuery = typeof search === 'string' ? search.trim() : '';
    if (searchQuery) {
      where.OR = [
        { title: { contains: searchQuery, mode: 'insensitive' } },
        { subject: { contains: searchQuery, mode: 'insensitive' } },
        { description: { contains: searchQuery, mode: 'insensitive' } },
      ];
    } else if (subject && typeof subject === 'string') {
      where.subject = { contains: subject.trim(), mode: 'insensitive' };
    }

    const isPaginated = page !== undefined || limit !== undefined;
    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 12));

    const total = await prisma.examPaper.count({ where });

    let papers;
    if (isPaginated) {
      papers = await prisma.examPaper.findMany({
        where,
        include: {
          uploadedBy: { select: { id: true, name: true, role: true } },
        },
        orderBy: [{ year: 'desc' }, { semester: 'asc' }, { subject: 'asc' }],
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      });
    } else {
      papers = await prisma.examPaper.findMany({
        where,
        include: {
          uploadedBy: { select: { id: true, name: true, role: true } },
        },
        orderBy: [{ year: 'desc' }, { semester: 'asc' }, { subject: 'asc' }],
      });
    }

    const totalPages = isPaginated ? Math.ceil(total / limitNum) || 1 : 1;

    res.json({
      papers,
      pagination: {
        total,
        page: isPaginated ? pageNum : 1,
        limit: isPaginated ? limitNum : total,
        totalPages,
      },
    });
  } catch (error) {
    console.error('List papers error:', error);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/exam/subjects - Get all subjects grouped by program/branch
router.get('/subjects', authenticate, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const subjects = await prisma.examPaper.groupBy({
      by: ['program', 'branch', 'subject', 'semester'],
      _count: { id: true },
      orderBy: [{ program: 'asc' }, { branch: 'asc' }, { semester: 'asc' }, { subject: 'asc' }],
    });

    res.json({ subjects });
  } catch (error) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/exam/papers/:id - Single paper details
router.get('/papers/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const paper = await prisma.examPaper.findUnique({
      where: { id: req.params.id },
      include: { uploadedBy: { select: { id: true, name: true, role: true } } },
    });

    if (!paper) {
      res.status(404).json({ error: 'Paper not found.' });
      return;
    }

    res.json({ paper });
  } catch (error) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/exam/papers - Upload question paper (Teacher/Librarian)
router.post(
  '/papers',
  authenticate,
  authorize('TEACHER', 'LIBRARIAN'),
  handleUpload,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { title, subject, program, branch, year, semester, type, description } = req.body;

      const cleanupUploadedFile = () => {
        if (req.file?.path && fs.existsSync(req.file.path)) {
          try {
            fs.unlinkSync(req.file.path);
          } catch (unlinkErr) {
            console.error('Failed to clean up uploaded file after validation error:', unlinkErr);
          }
        }
      };

      if (!title || !subject || !program || !branch || !year || !semester || !type) {
        cleanupUploadedFile();
        res.status(400).json({
          error: 'All fields (title, subject, program, branch, year, semester, type) are required.',
        });
        return;
      }

      if (!ALLOWED_PROGRAMS.includes(program)) {
        cleanupUploadedFile();
        res.status(400).json({
          error: `Invalid program. Allowed programs: ${ALLOWED_PROGRAMS.join(', ')}.`,
        });
        return;
      }

      if (!ALLOWED_TYPES.includes(type)) {
        cleanupUploadedFile();
        res.status(400).json({
          error: `Invalid resource type. Allowed types: ${ALLOWED_TYPES.join(', ')}.`,
        });
        return;
      }

      const semInt = parseInt(semester);
      if (isNaN(semInt) || semInt < 1 || semInt > 6) {
        cleanupUploadedFile();
        res.status(400).json({
          error: 'Invalid semester. Must be an integer between 1 and 6.',
        });
        return;
      }

      const yearInt = parseInt(year);
      const currentYear = new Date().getFullYear();
      if (isNaN(yearInt) || yearInt < 2000 || yearInt > currentYear + 2) {
        cleanupUploadedFile();
        res.status(400).json({
          error: `Invalid year. Must be between 2000 and ${currentYear + 2}.`,
        });
        return;
      }

      if (!req.file) {
        res.status(400).json({ error: 'Please upload a file.' });
        return;
      }

      // Execute paper creation and transactional audit logging atomically
      const paper = await prisma.$transaction(async (tx) => {
        const created = await tx.examPaper.create({
          data: {
            title: title.trim(),
            subject: subject.trim(),
            program,
            branch: branch.trim(),
            year: yearInt,
            semester: semInt,
            type,
            fileUrl: `/uploads/exam-papers/${req.file!.filename}`,
            description: description?.trim() || null,
            uploadedById: req.user!.id,
          },
          include: { uploadedBy: { select: { id: true, name: true, role: true } } },
        });

        await logAdminAction({
          actorId: req.user!.id,
          action: AUDIT_ACTIONS.EXAM_PAPER_UPLOADED,
          targetId: created.id,
          details: {
            title: created.title,
            subject: created.subject,
            program: created.program,
            branch: created.branch,
            year: created.year,
            semester: created.semester,
            type: created.type,
            fileName: req.file!.originalname,
            fileSize: req.file!.size,
          },
          tx,
        });

        return created;
      });

      res.status(201).json({ paper });
    } catch (error) {
      if (req.file?.path && fs.existsSync(req.file.path)) {
        try {
          fs.unlinkSync(req.file.path);
        } catch {}
      }
      console.error('Upload paper error:', error);
      res.status(500).json({ error: 'Server error uploading paper.' });
    }
  }
);

// Helper to ensure file path resides strictly inside target directory (cross-platform safe)
function isPathInside(childPath: string, parentDir: string): boolean {
  const rel = path.relative(parentDir, childPath);
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

// DELETE /api/exam/papers/:id - Delete paper (Librarian or Teacher who uploaded it)
router.delete(
  '/papers/:id',
  authenticate,
  authorize('TEACHER', 'LIBRARIAN'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const paper = await prisma.examPaper.findUnique({ where: { id: req.params.id } });

      if (!paper) {
        res.status(404).json({ error: 'Paper not found.' });
        return;
      }

      // Teachers can only delete their own uploads
      if (req.user!.role === 'TEACHER' && paper.uploadedById !== req.user!.id) {
        res.status(403).json({ error: 'Forbidden: You can only delete papers you uploaded.' });
        return;
      }

      // Safe file path resolution inside rootDir / uploadDir
      const relativePath = paper.fileUrl.startsWith('/') ? paper.fileUrl.slice(1) : paper.fileUrl;
      const filePath = path.resolve(rootDir, relativePath);

      // Verify file is within uploadDir before deleting to prevent directory traversal
      if (isPathInside(filePath, uploadDir) && fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (unlinkErr) {
          console.error('Failed to unlink exam paper file:', unlinkErr);
        }
      }

      // Transactionally delete paper and log audit action
      await prisma.$transaction(async (tx) => {
        await tx.examPaper.delete({ where: { id: req.params.id } });

        await logAdminAction({
          actorId: req.user!.id,
          action: AUDIT_ACTIONS.EXAM_PAPER_DELETED,
          targetId: paper.id,
          details: {
            title: paper.title,
            subject: paper.subject,
            program: paper.program,
            branch: paper.branch,
            semester: paper.semester,
            year: paper.year,
            type: paper.type,
            fileUrl: paper.fileUrl,
          },
          tx,
        });
      });

      res.json({ message: 'Paper deleted successfully.' });
    } catch (error) {
      console.error('Delete paper error:', error);
      res.status(500).json({ error: 'Server error.' });
    }
  }
);

export default router;
