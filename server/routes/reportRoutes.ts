import { Router, Response } from 'express';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { ReportingService, PeriodType } from '../services/reportingService.js';
import { generateCsv, CsvColumn } from '../lib/reports/csvExport.js';

const router = Router();

// Strict RBAC: All reporting routes require authenticated LIBRARIAN role
router.use(authenticate);
router.use(authorize('LIBRARIAN'));

const VALID_PERIODS = new Set<PeriodType>(['DAILY', 'WEEKLY', 'MONTHLY']);
const VALID_PROGRAMS = new Set(['BCOM', 'BBA', 'BSC']);

/**
 * Parses and validates ISO date string.
 * Returns Date object or null if invalid format or impossible date.
 */
function parseIsoDate(val: unknown): Date | null {
  if (typeof val !== 'string' || !val.trim()) return null;
  const trimmed = val.trim();
  // Expect YYYY-MM-DD or full ISO-8601 string
  if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(trimmed)) {
    return null;
  }
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

/**
 * GET /api/reports/circulation-summary
 *
 * Query params:
 * - startDate: ISO string (required)
 * - endDate: ISO string (required)
 * - period: DAILY | WEEKLY | MONTHLY (default: DAILY)
 * - format: json | csv (default: json)
 */
router.get('/circulation-summary', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { startDate: rawStart, endDate: rawEnd, period: rawPeriod, format = 'json' } = req.query;

    if (!rawStart || !rawEnd) {
      res.status(400).json({
        error: 'Missing required parameters. Both startDate and endDate are required.',
      });
      return;
    }

    const startDate = parseIsoDate(rawStart);
    const endDate = parseIsoDate(rawEnd);

    if (!startDate || !endDate) {
      res.status(400).json({
        error: 'Invalid date format. Expected valid ISO-8601 dates (e.g. YYYY-MM-DD).',
      });
      return;
    }

    if (startDate > endDate) {
      res.status(400).json({
        error: 'Invalid date ordering. startDate cannot be after endDate.',
      });
      return;
    }

    let period: PeriodType = 'DAILY';
    if (rawPeriod) {
      const pUpper = String(rawPeriod).trim().toUpperCase() as PeriodType;
      if (!VALID_PERIODS.has(pUpper)) {
        res.status(400).json({
          error: `Invalid period. Supported periods are: ${Array.from(VALID_PERIODS).join(', ')}.`,
        });
        return;
      }
      period = pUpper;
    }

    const summary = await ReportingService.getCirculationSummary({
      startDate,
      endDate,
      period,
    });

    if (format === 'csv') {
      const columns: CsvColumn[] = [
        { key: 'period', header: 'Period' },
        { key: 'issuedCount', header: 'Issued Loans' },
        { key: 'returnedCount', header: 'Returned Loans' },
        { key: 'renewalCount', header: 'Renewals' },
        { key: 'netCirculation', header: 'Net Circulation' },
      ];

      const csvContent = generateCsv(summary.breakdown, columns, {
        includeBom: true,
        neutralizeFormulas: true,
      });

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="circulation-summary-${period.toLowerCase()}.csv"`
      );
      res.status(200).send(csvContent);
      return;
    }

    res.json({
      success: true,
      data: summary,
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to generate circulation summary report.',
      details: error?.message || 'Internal server error',
    });
  }
});

/**
 * GET /api/reports/top-borrowed
 *
 * Query params:
 * - startDate: ISO string (optional)
 * - endDate: ISO string (optional)
 * - limit: number between 1 and 100 (default: 10)
 * - programId: BCOM | BBA | BSC (optional)
 * - format: json | csv (default: json)
 */
router.get('/top-borrowed', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      startDate: rawStart,
      endDate: rawEnd,
      limit: rawLimit,
      programId: rawProgram,
      format = 'json',
    } = req.query;

    let startDate: Date | undefined;
    let endDate: Date | undefined;

    if (rawStart) {
      const parsed = parseIsoDate(rawStart);
      if (!parsed) {
        res.status(400).json({ error: 'Invalid startDate format.' });
        return;
      }
      startDate = parsed;
    }

    if (rawEnd) {
      const parsed = parseIsoDate(rawEnd);
      if (!parsed) {
        res.status(400).json({ error: 'Invalid endDate format.' });
        return;
      }
      endDate = parsed;
    }

    if (startDate && endDate && startDate > endDate) {
      res.status(400).json({
        error: 'Invalid date ordering. startDate cannot be after endDate.',
      });
      return;
    }

    let limit = 10;
    if (rawLimit !== undefined) {
      const parsedLimit = parseInt(String(rawLimit), 10);
      if (Number.isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
        res.status(400).json({
          error: 'Invalid limit parameter. Expected an integer between 1 and 100.',
        });
        return;
      }
      limit = parsedLimit;
    }

    let programId: string | undefined;
    if (rawProgram) {
      const progUpper = String(rawProgram).trim().toUpperCase();
      if (!VALID_PROGRAMS.has(progUpper)) {
        res.status(400).json({
          error: `Invalid program filter. Supported programs are: ${Array.from(VALID_PROGRAMS).join(', ')}.`,
        });
        return;
      }
      programId = progUpper;
    }

    const report = await ReportingService.getTopBorrowedTitles({
      startDate,
      endDate,
      limit,
      programId,
    });

    if (format === 'csv') {
      const columns: CsvColumn[] = [
        { key: 'title', header: 'Book Title' },
        { key: 'author', header: 'Author' },
        { key: 'isbn', header: 'ISBN' },
        { key: 'category', header: 'Category' },
        { key: 'borrowCount', header: 'Total Borrows' },
        {
          key: 'programs',
          header: 'Programs',
          formatter: (row) => (row.programs && row.programs.length > 0 ? row.programs.join('; ') : 'General'),
        },
      ];

      const csvContent = generateCsv(report.titles, columns, {
        includeBom: true,
        neutralizeFormulas: true,
      });

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="top-borrowed-titles.csv"');
      res.status(200).send(csvContent);
      return;
    }

    res.json({
      success: true,
      data: report,
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to generate top borrowed titles report.',
      details: error?.message || 'Internal server error',
    });
  }
});

/**
 * GET /api/reports/overdue-loss
 *
 * Query params:
 * - asOfDate: ISO string (optional, defaults to current time)
 * - startDate: ISO string (optional)
 * - endDate: ISO string (optional)
 * - programId: BCOM | BBA | BSC (optional)
 * - format: json | csv (default: json)
 */
router.get('/overdue-loss', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      asOfDate: rawAsOf,
      startDate: rawStart,
      endDate: rawEnd,
      programId: rawProgram,
      format = 'json',
    } = req.query;

    let asOfDate: Date | undefined;
    if (rawAsOf) {
      const parsedAsOf = parseIsoDate(rawAsOf);
      if (!parsedAsOf) {
        res.status(400).json({ error: 'Invalid asOfDate format. Expected valid ISO-8601 date.' });
        return;
      }
      asOfDate = parsedAsOf;
    }

    let startDate: Date | undefined;
    let endDate: Date | undefined;

    if (rawStart) {
      const parsedStart = parseIsoDate(rawStart);
      if (!parsedStart) {
        res.status(400).json({ error: 'Invalid startDate format.' });
        return;
      }
      startDate = parsedStart;
    }

    if (rawEnd) {
      const parsedEnd = parseIsoDate(rawEnd);
      if (!parsedEnd) {
        res.status(400).json({ error: 'Invalid endDate format.' });
        return;
      }
      endDate = parsedEnd;
    }

    if (startDate && endDate && startDate > endDate) {
      res.status(400).json({
        error: 'Invalid date ordering. startDate cannot be after endDate.',
      });
      return;
    }

    let programId: string | undefined;
    if (rawProgram) {
      const progUpper = String(rawProgram).trim().toUpperCase();
      if (!VALID_PROGRAMS.has(progUpper)) {
        res.status(400).json({
          error: `Invalid program filter. Supported programs are: ${Array.from(VALID_PROGRAMS).join(', ')}.`,
        });
        return;
      }
      programId = progUpper;
    }

    const report = await ReportingService.getOverdueAndLossReport({
      asOfDate,
      startDate,
      endDate,
      programId,
    });

    if (format === 'csv') {
      const columns: CsvColumn[] = [
        { key: 'bookTitle', header: 'Book Title' },
        { key: 'copyNumber', header: 'Copy Number' },
        { key: 'barcode', header: 'Barcode' },
        { key: 'borrowerRole', header: 'Borrower Role' },
        { key: 'borrowerProgram', header: 'Program' },
        { key: 'borrowerBranch', header: 'Branch' },
        { key: 'borrowerYear', header: 'Year' },
        { key: 'issuedDate', header: 'Issued Date' },
        { key: 'dueDate', header: 'Due Date' },
        { key: 'daysOverdue', header: 'Days Overdue' },
        { key: 'agingBucket', header: 'Aging Bucket' },
      ];

      const csvContent = generateCsv(report.overdueSummary.items, columns, {
        includeBom: true,
        neutralizeFormulas: true,
      });

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="overdue-loans-report.csv"');
      res.status(200).send(csvContent);
      return;
    }

    res.json({
      success: true,
      data: report,
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to generate overdue and loss report.',
      details: error?.message || 'Internal server error',
    });
  }
});

/**
 * GET /api/reports/inventory-analytics
 *
 * Query params:
 * - startDate: ISO string (optional)
 * - endDate: ISO string (optional)
 * - programId: BCOM | BBA | BSC (optional)
 * - format: json | csv (default: json)
 */
router.get('/inventory-analytics', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      startDate: rawStart,
      endDate: rawEnd,
      programId: rawProgram,
      format = 'json',
    } = req.query;

    let startDate: Date | undefined;
    let endDate: Date | undefined;

    if (rawStart) {
      const parsedStart = parseIsoDate(rawStart);
      if (!parsedStart) {
        res.status(400).json({ error: 'Invalid startDate format. Expected valid ISO-8601 date.' });
        return;
      }
      startDate = parsedStart;
    }

    if (rawEnd) {
      const parsedEnd = parseIsoDate(rawEnd);
      if (!parsedEnd) {
        res.status(400).json({ error: 'Invalid endDate format. Expected valid ISO-8601 date.' });
        return;
      }
      endDate = parsedEnd;
    }

    if (startDate && endDate && startDate > endDate) {
      res.status(400).json({
        error: 'Invalid date ordering. startDate cannot be after endDate.',
      });
      return;
    }

    let programId: string | undefined;
    if (rawProgram) {
      const progUpper = String(rawProgram).trim().toUpperCase();
      if (!VALID_PROGRAMS.has(progUpper)) {
        res.status(400).json({
          error: `Invalid program filter. Supported programs are: ${Array.from(VALID_PROGRAMS).join(', ')}.`,
        });
        return;
      }
      programId = progUpper;
    }

    const fmt = String(format).trim().toLowerCase();
    if (fmt !== 'json' && fmt !== 'csv') {
      res.status(400).json({
        error: 'Invalid format. Supported formats are: json, csv.',
      });
      return;
    }

    const report = await ReportingService.getInventoryAnalytics({
      startDate,
      endDate,
      programId,
    });

    if (fmt === 'csv') {
      const columns: CsvColumn[] = [
        { key: 'bookTitle', header: 'Book Title' },
        { key: 'copyNumber', header: 'Copy Number' },
        { key: 'barcode', header: 'Barcode' },
        { key: 'condition', header: 'Condition' },
        { key: 'status', header: 'Status' },
        { key: 'shelfLocation', header: 'Shelf Location' },
        {
          key: 'programs',
          header: 'Programs',
          formatter: (v) => (Array.isArray(v) ? v.join('; ') : String(v || '')),
        },
      ];

      const csvContent = generateCsv(report.copies, columns, {
        includeBom: true,
        neutralizeFormulas: true,
      });

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="inventory-analytics.csv"');
      res.status(200).send(csvContent);
      return;
    }

    res.json({
      success: true,
      data: report,
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to generate inventory analytics report.',
      details: error?.message || 'Internal server error',
    });
  }
});

export default router;
