import { Router, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import crypto from 'crypto';
import prisma, { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { logAdminAction, AUDIT_ACTIONS } from '../lib/auditLogger.js';
import {
  getDocumentStorageAdapter,
  validateExamPaperFile,
  ALLOWED_EXTENSIONS,
  MAX_EXAM_PAPER_BYTES,
} from '../lib/storage/index.js';

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
const uploadDir = path.join(rootDir, 'uploads', 'exam-papers');

// In-memory Multer for safe upload processing (zero unmanaged disk writes)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_EXAM_PAPER_BYTES }, // 10MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_EXTENSIONS.includes(ext)) {
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

function isPathInside(childPath: string, parentDir: string): boolean {
  const rel = path.relative(parentDir, childPath);
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

const router = Router();

const ALLOWED_PROGRAMS = ['BCOM', 'BBA', 'BSC'];
const ALLOWED_TYPES = ['PREVIOUS_YEAR', 'IMPORTANT_QUESTIONS', 'STUDY_GUIDE'];

// GET /api/exam/papers - List exam papers with filters, search, publication status, and pagination
router.get('/papers', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { program, branch, year, semester, subject, type, search, page, limit, status, myUploadsOnly } =
      req.query;

    const where: any = {};
    if (program && typeof program === 'string') where.program = program;
    if (branch && typeof branch === 'string') where.branch = branch;
    if (year) where.year = parseInt(year as string);
    if (semester) where.semester = parseInt(semester as string);
    if (type && typeof type === 'string') where.type = type;

    // Publication Role Gate:
    // - STUDENT: Can ONLY see published papers (publishedAt !== null)
    // - TEACHER: Sees published papers + own unpublished uploads (unless myUploadsOnly requested)
    // - LIBRARIAN: Sees all papers, can filter by status=pending or status=published
    if (req.user!.role === 'STUDENT') {
      where.publishedAt = { not: null };
    } else if (req.user!.role === 'TEACHER') {
      if (myUploadsOnly === 'true') {
        where.uploadedById = req.user!.id;
      } else {
        where.OR = [{ publishedAt: { not: null } }, { uploadedById: req.user!.id }];
      }
    } else if (req.user!.role === 'LIBRARIAN') {
      if (status === 'pending' || status === 'unpublished') {
        where.publishedAt = null;
      } else if (status === 'published') {
        where.publishedAt = { not: null };
      }
    }

    // Search query: if search is supplied, match across title, subject, and description
    const searchQuery = typeof search === 'string' ? search.trim() : '';
    if (searchQuery) {
      const searchConditions = [
        { title: { contains: searchQuery, mode: 'insensitive' } },
        { subject: { contains: searchQuery, mode: 'insensitive' } },
        { description: { contains: searchQuery, mode: 'insensitive' } },
      ];

      if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: searchConditions }];
        delete where.OR;
      } else {
        where.OR = searchConditions;
      }
    } else if (subject && typeof subject === 'string') {
      where.subject = { contains: subject.trim(), mode: 'insensitive' };
    }

    const isPaginated = page !== undefined || limit !== undefined;
    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 12));

    const total = await prisma.examPaper.count({ where });

    const queryOptions: any = {
      where,
      include: {
        uploadedBy: { select: { id: true, name: true, role: true } },
      },
      orderBy: [{ year: 'desc' }, { semester: 'asc' }, { subject: 'asc' }],
    };

    if (isPaginated) {
      queryOptions.skip = (pageNum - 1) * limitNum;
      queryOptions.take = limitNum;
    }

    const papers = await prisma.examPaper.findMany(queryOptions);
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
router.get('/subjects', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const where: any = {};
    if (req.user!.role === 'STUDENT') {
      where.publishedAt = { not: null };
    }

    const subjects = await prisma.examPaper.groupBy({
      by: ['program', 'branch', 'subject', 'semester'],
      where: Object.keys(where).length > 0 ? where : undefined,
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

    // Students cannot view unpublished papers
    if (req.user!.role === 'STUDENT' && !paper.publishedAt) {
      res.status(403).json({
        error: 'Forbidden: This examination paper is pending librarian review and has not yet been published.',
      });
      return;
    }

    // Teachers cannot view unpublished papers uploaded by other faculty
    if (req.user!.role === 'TEACHER' && !paper.publishedAt && paper.uploadedById !== req.user!.id) {
      res.status(403).json({
        error: 'Forbidden: This examination paper is pending librarian review.',
      });
      return;
    }

    res.json({ paper });
  } catch (error) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/exam/papers/:id/download - Secure, authenticated paper download
router.get('/papers/:id/download', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const paper = await prisma.examPaper.findUnique({
      where: { id: req.params.id },
    });

    if (!paper) {
      res.status(404).json({ error: 'Paper not found.' });
      return;
    }

    // Student publication enforcement
    if (req.user!.role === 'STUDENT' && !paper.publishedAt) {
      res.status(403).json({
        error: 'Forbidden: This examination paper is pending librarian review and has not yet been published.',
      });
      return;
    }

    // Teacher publication enforcement
    if (req.user!.role === 'TEACHER' && !paper.publishedAt && paper.uploadedById !== req.user!.id) {
      res.status(403).json({
        error: 'Forbidden: This examination paper is pending librarian review.',
      });
      return;
    }

    const storageAdapter = getDocumentStorageAdapter(paper.storageProvider);

    // 1. Cloudflare R2 / S3 Presigned URL Redirection
    if (
      storageAdapter.getSignedDownloadUrl &&
      (paper.storageProvider === 'r2' || paper.storageProvider === 's3')
    ) {
      const storageKey = paper.storageKey || paper.fileUrl;
      const signedUrl = await storageAdapter.getSignedDownloadUrl(storageKey, 60);
      if (req.query.json === 'true' || req.headers.accept?.includes('application/json')) {
        res.json({ downloadUrl: signedUrl, expiresInSeconds: 60 });
        return;
      }
      res.redirect(302, signedUrl);
      return;
    }

    // 2. Local Storage Driver / Stream Serving
    const storageKey = paper.storageKey || paper.fileUrl;
    const storedObject = await storageAdapter.get(storageKey);

    if (storedObject) {
      const mime = paper.mimeType || storedObject.mimeType || 'application/pdf';
      const downloadName = paper.originalFileName || path.basename(paper.fileUrl) || 'exam-paper.pdf';

      res.setHeader('Content-Type', mime);
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(downloadName)}"`);
      res.setHeader('Content-Length', storedObject.sizeBytes);
      res.send(storedObject.data);
      return;
    }

    // 3. Fallback to reading legacy file directly from uploads directory if exists
    const relativePath = paper.fileUrl.startsWith('/') ? paper.fileUrl.slice(1) : paper.fileUrl;
    const legacyPath = path.resolve(rootDir, relativePath);

    if (isPathInside(legacyPath, rootDir) && fs.existsSync(legacyPath)) {
      const downloadName = paper.originalFileName || path.basename(paper.fileUrl) || 'exam-paper.pdf';
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(downloadName)}"`);
      res.sendFile(legacyPath);
      return;
    }

    res.status(404).json({ error: 'Examination paper file not found in storage.' });
  } catch (error) {
    console.error('Download paper error:', error);
    res.status(500).json({ error: 'Server error downloading paper.' });
  }
});

// POST /api/exam/papers - Upload question paper (Teacher/Librarian)
router.post(
  '/papers',
  authenticate,
  authorize('TEACHER', 'LIBRARIAN'),
  handleUpload,
  async (req: AuthRequest, res: Response): Promise<void> => {
    let uploadedStorageKey: string | null = null;
    const storageAdapter = getDocumentStorageAdapter();

    try {
      const { title, subject, program, branch, year, semester, type, description, publish } = req.body;

      if (!title || !subject || !program || !branch || !year || !semester || !type) {
        res.status(400).json({
          error: 'All fields (title, subject, program, branch, year, semester, type) are required.',
        });
        return;
      }

      if (!ALLOWED_PROGRAMS.includes(program)) {
        res.status(400).json({
          error: `Invalid program. Allowed programs: ${ALLOWED_PROGRAMS.join(', ')}.`,
        });
        return;
      }

      if (!ALLOWED_TYPES.includes(type)) {
        res.status(400).json({
          error: `Invalid resource type. Allowed types: ${ALLOWED_TYPES.join(', ')}.`,
        });
        return;
      }

      const semInt = parseInt(semester);
      if (isNaN(semInt) || semInt < 1 || semInt > 6) {
        res.status(400).json({
          error: 'Invalid semester. Must be an integer between 1 and 6.',
        });
        return;
      }

      const yearInt = parseInt(year);
      const currentYear = new Date().getFullYear();
      if (isNaN(yearInt) || yearInt < 2000 || yearInt > currentYear + 2) {
        res.status(400).json({
          error: `Invalid year. Must be between 2000 and ${currentYear + 2}.`,
        });
        return;
      }

      if (!req.file || !req.file.buffer) {
        res.status(400).json({ error: 'Please upload a file.' });
        return;
      }

      // Binary Magic-Byte & Signature Validation
      const fileValidation = validateExamPaperFile(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype
      );

      if (!fileValidation.valid) {
        res.status(400).json({ error: fileValidation.error || 'Invalid file format.' });
        return;
      }

      // Generate UUID, storage key and checksum
      const paperId = crypto.randomUUID();
      const sanitizedName = path.basename(req.file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const filename = uniqueSuffix + path.extname(req.file.originalname);
      const storageKey = `exam-papers/${paperId}/${sanitizedName}`;
      uploadedStorageKey = storageKey;

      const checksum = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
      const detectedMime = fileValidation.detectedMime || req.file.mimetype || 'application/pdf';

      // Persist binary into storage adapter
      await storageAdapter.put(storageKey, req.file.buffer, {
        mimeType: detectedMime,
        sizeBytes: req.file.buffer.length,
        originalName: req.file.originalname,
        checksum,
      });

      // Also support legacy local disk path for seamless backward compatibility during testing
      const legacyDiskPath = path.join(uploadDir, filename);
      try {
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }
        fs.writeFileSync(legacyDiskPath, req.file.buffer);
      } catch (legacyDiskErr) {
        console.warn('Legacy disk mirror failed (non-fatal in cloud mode):', legacyDiskErr);
      }

      const storageProvider =
        process.env.STORAGE_DRIVER === 'r2' || process.env.STORAGE_DRIVER === 's3' ? 'r2' : 'local';

      // Publication Policy:
      // - Librarians can publish immediately if requested via publish=true, or default to published
      // - Teachers CANNOT self-publish: all teacher uploads default to publishedAt: null (pending review)
      let initialPublishedAt: Date | null = null;
      if (req.user!.role === 'LIBRARIAN') {
        // In existing test suites and librarian workflows, librarian uploads are published by default unless explicit false
        initialPublishedAt = publish === 'false' || publish === false ? null : new Date();
      }

      // Execute paper creation and transactional audit logging atomically
      const paper = await prisma.$transaction(async (tx) => {
        const created = await tx.examPaper.create({
          data: {
            id: paperId,
            title: title.trim(),
            subject: subject.trim(),
            program,
            branch: branch.trim(),
            year: yearInt,
            semester: semInt,
            type,
            fileUrl: `/uploads/exam-papers/${filename}`,
            description: description?.trim() || null,
            uploadedById: req.user!.id,
            storageProvider,
            storageKey,
            originalFileName: req.file!.originalname,
            mimeType: detectedMime,
            fileSizeBytes: req.file!.buffer.length,
            checksum,
            publishedAt: initialPublishedAt,
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
            fileSize: req.file!.buffer.length,
            checksum,
            storageProvider,
            storageKey,
            published: Boolean(created.publishedAt),
          },
          tx,
        });

        return created;
      });

      res.status(201).json({ paper });
    } catch (error) {
      if (uploadedStorageKey) {
        try {
          await storageAdapter.delete(uploadedStorageKey);
        } catch (cleanupErr) {
          console.error('Failed to cleanup uploaded storage object after error:', cleanupErr);
        }
      }
      console.error('Upload paper error:', error);
      res.status(500).json({ error: 'Server error uploading paper.' });
    }
  }
);

// PUT /api/exam/papers/:id/publish - Librarian approves and publishes exam paper
router.put(
  '/papers/:id/publish',
  authenticate,
  authorize('LIBRARIAN'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const paper = await prisma.examPaper.findUnique({
        where: { id: req.params.id },
      });

      if (!paper) {
        res.status(404).json({ error: 'Paper not found.' });
        return;
      }

      const publishedAt = new Date();

      const updated = await prisma.$transaction(async (tx) => {
        const p = await tx.examPaper.update({
          where: { id: req.params.id },
          data: { publishedAt },
          include: { uploadedBy: { select: { id: true, name: true, role: true } } },
        });

        await logAdminAction({
          actorId: req.user!.id,
          action: AUDIT_ACTIONS.EXAM_PAPER_PUBLISHED,
          targetId: p.id,
          details: {
            title: p.title,
            publishedAt: publishedAt.toISOString(),
            subject: p.subject,
            program: p.program,
            semester: p.semester,
          },
          tx,
        });

        return p;
      });

      res.json({ message: 'Exam paper published successfully.', paper: updated });
    } catch (error) {
      console.error('Publish paper error:', error);
      res.status(500).json({ error: 'Server error publishing paper.' });
    }
  }
);

// PUT /api/exam/papers/:id/unpublish - Librarian unpublishes exam paper
router.put(
  '/papers/:id/unpublish',
  authenticate,
  authorize('LIBRARIAN'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const paper = await prisma.examPaper.findUnique({
        where: { id: req.params.id },
      });

      if (!paper) {
        res.status(404).json({ error: 'Paper not found.' });
        return;
      }

      const updated = await prisma.$transaction(async (tx) => {
        const p = await tx.examPaper.update({
          where: { id: req.params.id },
          data: { publishedAt: null },
          include: { uploadedBy: { select: { id: true, name: true, role: true } } },
        });

        await logAdminAction({
          actorId: req.user!.id,
          action: AUDIT_ACTIONS.EXAM_PAPER_UNPUBLISHED,
          targetId: p.id,
          details: {
            title: p.title,
            unpublishedAt: new Date().toISOString(),
            subject: p.subject,
          },
          tx,
        });

        return p;
      });

      res.json({ message: 'Exam paper unpublished successfully.', paper: updated });
    } catch (error) {
      console.error('Unpublish paper error:', error);
      res.status(500).json({ error: 'Server error unpublishing paper.' });
    }
  }
);

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

      const storageAdapter = getDocumentStorageAdapter(paper.storageProvider);

      // Clean up cloud / storage adapter object
      if (paper.storageKey) {
        try {
          await storageAdapter.delete(paper.storageKey);
        } catch (storageErr) {
          console.warn('Storage adapter delete error:', storageErr);
        }
      }

      // Clean up legacy local file if exists
      const relativePath = paper.fileUrl.startsWith('/') ? paper.fileUrl.slice(1) : paper.fileUrl;
      const filePath = path.resolve(rootDir, relativePath);

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
            storageKey: paper.storageKey,
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
