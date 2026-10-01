import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import prisma, { authenticate, authorize, AuthRequest } from '../middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure multer for file uploads
const uploadDir = path.join(__dirname, '..', '..', 'uploads', 'exam-papers');
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

const router = Router();

// GET /api/exam/papers - List exam papers with filters
router.get('/papers', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { program, branch, year, semester, subject, type } = req.query;

    const where: any = {};
    if (program) where.program = program;
    if (branch) where.branch = branch;
    if (year) where.year = parseInt(year as string);
    if (semester) where.semester = parseInt(semester as string);
    if (subject) where.subject = { contains: subject as string };
    if (type) where.type = type;

    const papers = await prisma.examPaper.findMany({
      where,
      include: {
        uploadedBy: { select: { name: true, role: true } },
      },
      orderBy: [{ year: 'desc' }, { semester: 'asc' }, { subject: 'asc' }],
    });

    res.json({ papers });
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
      include: { uploadedBy: { select: { name: true, role: true } } },
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
router.post('/papers', authenticate, authorize('TEACHER', 'LIBRARIAN'), upload.single('file'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { title, subject, program, branch, year, semester, type, description } = req.body;

    if (!title || !subject || !program || !branch || !year || !semester || !type) {
      res.status(400).json({ error: 'All fields (title, subject, program, branch, year, semester, type) are required.' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: 'Please upload a file.' });
      return;
    }

    const paper = await prisma.examPaper.create({
      data: {
        title,
        subject,
        program,
        branch,
        year: parseInt(year),
        semester: parseInt(semester),
        type,
        fileUrl: `/uploads/exam-papers/${req.file.filename}`,
        description: description || null,
        uploadedById: req.user!.id,
      },
      include: { uploadedBy: { select: { name: true, role: true } } },
    });

    res.status(201).json({ paper });
  } catch (error) {
    console.error('Upload paper error:', error);
    res.status(500).json({ error: 'Server error uploading paper.' });
  }
});

// DELETE /api/exam/papers/:id - Delete paper (Librarian or Teacher who uploaded it)
router.delete('/papers/:id', authenticate, authorize('TEACHER', 'LIBRARIAN'), async (req: AuthRequest, res: Response): Promise<void> => {
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

    // Delete the file
    const filePath = path.join(__dirname, '..', '..', paper.fileUrl);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await prisma.examPaper.delete({ where: { id: req.params.id } });
    res.json({ message: 'Paper deleted successfully.' });
  } catch (error) {
    console.error('Delete paper error:', error);
    res.status(500).json({ error: 'Server error.' });
  }
});

export default router;
