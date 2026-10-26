import { Router, Response } from 'express';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { AuditService, AUDIT_TYPES, AUDIT_STATUSES, AuditType, AuditStatus } from '../services/auditService.js';
import { InventoryAuditService } from '../services/inventoryAuditService.js';
import {
  DiscrepancyService,
  DiscrepancyStatus,
  DiscrepancyCategory,
  DiscrepancySeverity,
  DISCREPANCY_STATUSES,
  DISCREPANCY_CATEGORIES,
} from '../services/discrepancyService.js';
import { generateCsv } from '../lib/reports/csvExport.js';

const router = Router();

// Strict RBAC: All institutional audit routes strictly require authenticated LIBRARIAN role
router.use(authenticate);
router.use(authorize('LIBRARIAN'));

/**
 * Parses and validates ISO date string.
 */
function parseIsoDate(val: unknown): Date | null {
  if (typeof val !== 'string' || !val.trim()) return null;
  const trimmed = val.trim();
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
 * GET /api/audits/summary/dashboard
 * Aggregates high-level metrics for the librarian audit dashboard.
 */
router.get('/summary/dashboard', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const metrics = await AuditService.getDashboardMetrics();
    res.json({
      success: true,
      data: metrics,
    });
  } catch (error: any) {
    console.error('Error fetching audit dashboard metrics:', error);
    res.status(error.status || 500).json({ error: error.error || error.message || 'Internal server error' });
  }
});

/**
 * GET /api/audits
 * Lists library audits with optional type, status, and pagination filters.
 */
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { type, status, academicYear, page, limit } = req.query;

    const result = await AuditService.getAudits({
      type: type ? (String(type).toUpperCase() as AuditType) : undefined,
      status: status ? (String(status).toUpperCase() as AuditStatus) : undefined,
      academicYear: academicYear ? String(academicYear) : undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });

    res.json({
      success: true,
      data: result.audits,
      pagination: result.pagination,
    });
  } catch (error: any) {
    console.error('Error listing library audits:', error);
    res.status(error.status || 500).json({ error: error.error || error.message || 'Internal server error' });
  }
});

/**
 * POST /api/audits
 * Initiates a new library audit.
 */
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { type, title, periodStart: rawStart, periodEnd: rawEnd, academicYear, observations, recommendations } = req.body;

    if (!type || !title || !rawStart || !rawEnd) {
      res.status(400).json({
        error: 'Missing required fields. type, title, periodStart, and periodEnd are required.',
      });
      return;
    }

    const typeUpper = String(type).trim().toUpperCase() as AuditType;
    if (!Object.values(AUDIT_TYPES).includes(typeUpper)) {
      res.status(400).json({
        error: `Invalid audit type. Allowed types: ${Object.values(AUDIT_TYPES).join(', ')}`,
      });
      return;
    }

    const periodStart = parseIsoDate(rawStart);
    const periodEnd = parseIsoDate(rawEnd);

    if (!periodStart || !periodEnd) {
      res.status(400).json({
        error: 'Invalid date format. Expected valid ISO-8601 dates (e.g. YYYY-MM-DD).',
      });
      return;
    }

    if (periodStart > periodEnd) {
      res.status(400).json({
        error: 'periodStart cannot be after periodEnd.',
      });
      return;
    }

    const leadLibrarianId = req.user?.id;
    if (!leadLibrarianId) {
      res.status(401).json({ error: 'Unauthenticated session.' });
      return;
    }

    const audit = await AuditService.createAudit(
      {
        type: typeUpper,
        title: String(title).trim(),
        periodStart,
        periodEnd,
        academicYear: academicYear ? String(academicYear).trim() : undefined,
        leadLibrarianId,
        observations: observations ? String(observations) : undefined,
        recommendations: recommendations ? String(recommendations) : undefined,
      },
      leadLibrarianId
    );

    res.status(201).json({
      success: true,
      message: 'Library audit engagement successfully initiated.',
      data: audit,
    });
  } catch (error: any) {
    console.error('Error creating library audit:', error);
    res.status(error.status || 500).json({ error: error.error || error.message || 'Internal server error' });
  }
});

/**
 * GET /api/audits/discrepancies/all
 * Lists discrepancies across all audits with optional status, category, severity, and search filters.
 */
router.get('/discrepancies/all', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { status, category, severity, search, page, limit } = req.query;

    const result = await DiscrepancyService.getDiscrepancies({
      status: status ? (String(status).toUpperCase() as DiscrepancyStatus) : undefined,
      category: category ? (String(category).toUpperCase() as DiscrepancyCategory) : undefined,
      severity: severity ? (String(severity).toUpperCase() as DiscrepancySeverity) : undefined,
      search: search ? String(search) : undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });

    res.json({
      success: true,
      data: result.discrepancies,
      pagination: result.pagination,
    });
  } catch (error: any) {
    console.error('Error listing discrepancies:', error);
    res.status(error.status || 500).json({ error: error.error || error.message || 'Internal server error' });
  }
});

/**
 * GET /api/audits/discrepancies/:discrepancyId
 * Retrieves full details and corrective action history for a specific discrepancy.
 */
router.get('/discrepancies/:discrepancyId', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { discrepancyId } = req.params;
    const discrepancy = await DiscrepancyService.getDiscrepancyById(discrepancyId);

    res.json({
      success: true,
      data: discrepancy,
    });
  } catch (error: any) {
    console.error('Error fetching discrepancy:', error);
    res.status(error.status || 500).json({ error: error.error || error.message || 'Internal server error' });
  }
});

/**
 * POST /api/audits/discrepancies/:discrepancyId/actions
 * Records a corrective action against a discrepancy and updates its workflow status.
 */
router.post('/discrepancies/:discrepancyId/actions', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { discrepancyId } = req.params;
    const { actionTaken, resultingStatus, notes } = req.body;

    const actorId = req.user?.id || 'system';

    const result = await DiscrepancyService.recordCorrectiveAction(
      discrepancyId,
      {
        actionTaken,
        resultingStatus,
        notes,
      },
      actorId
    );

    res.status(201).json({
      success: true,
      message: 'Corrective action recorded successfully.',
      data: result,
    });
  } catch (error: any) {
    console.error('Error recording corrective action:', error);
    res.status(error.status || 500).json({ error: error.error || error.message || 'Internal server error' });
  }
});

/**
 * GET /api/audits/:id
 * Retrieves complete audit detail by ID.
 */
router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const audit = await AuditService.getAuditById(id);
    res.json({
      success: true,
      data: audit,
    });
  } catch (error: any) {
    console.error('Error retrieving library audit:', error);
    res.status(error.status || 500).json({ error: error.error || error.message || 'Internal server error' });
  }
});

/**
 * PATCH /api/audits/:id/status
 * Updates the lifecycle status of an audit according to state machine rules.
 */
router.patch('/:id/status', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { status: rawStatus, observations, recommendations, snapshotData } = req.body;

    if (!rawStatus) {
      res.status(400).json({ error: 'Missing required status parameter.' });
      return;
    }

    const newStatus = String(rawStatus).trim().toUpperCase() as AuditStatus;
    if (!Object.values(AUDIT_STATUSES).includes(newStatus)) {
      res.status(400).json({
        error: `Invalid status. Allowed statuses: ${Object.values(AUDIT_STATUSES).join(', ')}`,
      });
      return;
    }

    const actorId = req.user?.id || 'system';

    const updated = await AuditService.updateAuditStatus(id, newStatus, actorId, {
      observations,
      recommendations,
      snapshotData,
    });

    res.json({
      success: true,
      message: `Audit status successfully updated to ${newStatus}.`,
      data: updated,
    });
  } catch (error: any) {
    console.error('Error updating audit status:', error);
    res.status(error.status || 500).json({ error: error.error || error.message || 'Internal server error' });
  }
});

/**
 * PATCH /api/audits/:id/notes
 * Updates observations and recommendations on an open/in-progress audit.
 */
router.patch('/:id/notes', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { observations, recommendations } = req.body;

    const actorId = req.user?.id || 'system';

    const updated = await AuditService.updateAuditNotes(id, { observations, recommendations }, actorId);

    res.json({
      success: true,
      message: 'Audit notes successfully updated.',
      data: updated,
    });
  } catch (error: any) {
    console.error('Error updating audit notes:', error);
    res.status(error.status || 500).json({ error: error.error || error.message || 'Internal server error' });
  }
});


/**
 * GET /api/audits/:id/report
 * Retrieves the compiled operational report for an audit engagement.
 * Returns frozen snapshot if completed/closed, or live dynamic compilation if active.
 */
router.get('/:id/report', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const result = await AuditService.getAuditReport(id);

    res.json({
      success: true,
      isFrozenSnapshot: result.isFrozenSnapshot,
      data: result.report,
      audit: result.audit,
    });
  } catch (error: any) {
    console.error('Error fetching audit operational report:', error);
    res.status(error.status || 500).json({ error: error.error || error.message || 'Internal server error' });
  }
});

/**
 * POST /api/audits/:id/compile-snapshot
 * Freezes live operational report into snapshotData JSON.
 */
router.post('/:id/compile-snapshot', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const actorId = req.user?.id || 'system';

    const result = await AuditService.freezeAuditSnapshot(id, actorId);

    res.json({
      success: true,
      message: 'Operational audit snapshot successfully compiled and frozen.',
      data: result.report,
      audit: result.audit,
    });
  } catch (error: any) {
    console.error('Error compiling audit snapshot:', error);
    res.status(error.status || 500).json({ error: error.error || error.message || 'Internal server error' });
  }
});

/**
 * GET /api/audits/:id/discrepancies
 * Lists discrepancies associated with a specific audit engagement.
 */
router.get('/:id/discrepancies', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { status, category, severity, search, page, limit } = req.query;

    const result = await DiscrepancyService.getDiscrepancies({
      auditId: id,
      status: status ? (String(status).toUpperCase() as DiscrepancyStatus) : undefined,
      category: category ? (String(category).toUpperCase() as DiscrepancyCategory) : undefined,
      severity: severity ? (String(severity).toUpperCase() as DiscrepancySeverity) : undefined,
      search: search ? String(search) : undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });

    res.json({
      success: true,
      data: result.discrepancies,
      pagination: result.pagination,
    });
  } catch (error: any) {
    console.error('Error fetching audit discrepancies:', error);
    res.status(error.status || 500).json({ error: error.error || error.message || 'Internal server error' });
  }
});

/**
 * POST /api/audits/:id/discrepancies
 * Manually documents an audit discrepancy against an audit engagement.
 */
router.post('/:id/discrepancies', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { bookId, bookCopyId, barcode, category, severity, description } = req.body;

    const actorId = req.user?.id || 'system';

    const discrepancy = await DiscrepancyService.createDiscrepancy(
      {
        auditId: id,
        bookId,
        bookCopyId,
        barcode,
        category: String(category).toUpperCase() as DiscrepancyCategory,
        severity: severity ? (String(severity).toUpperCase() as DiscrepancySeverity) : 'MEDIUM',
        description,
      },
      actorId
    );

    res.status(201).json({
      success: true,
      message: 'Discrepancy successfully logged.',
      data: discrepancy,
    });
  } catch (error: any) {
    console.error('Error logging discrepancy:', error);
    res.status(error.status || 500).json({ error: error.error || error.message || 'Internal server error' });
  }
});

// ─── Physical Inventory Audit Endpoints (Sub-Phase 11C) ───────────────

/**
 * POST /api/audits/:id/inventory-session
 * Initiates or returns active physical inventory barcode scanning session.
 */
router.post('/:id/inventory-session', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const actorId = req.user?.id || 'system';

    const session = await InventoryAuditService.startSession(id, actorId);

    res.status(200).json({
      success: true,
      data: session,
    });
  } catch (error: any) {
    console.error('Error starting inventory audit session:', error);
    res.status(error.status || 500).json({ error: error.error || error.message || 'Internal server error' });
  }
});

/**
 * GET /api/audits/:id/inventory-session
 * Retrieves session metrics, progress, recent scans, and exceptions.
 */
router.get('/:id/inventory-session', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const summary = await InventoryAuditService.getSessionSummary(id);

    res.json({
      success: true,
      data: summary,
    });
  } catch (error: any) {
    console.error('Error fetching inventory audit session:', error);
    res.status(error.status || 500).json({ error: error.error || error.message || 'Internal server error' });
  }
});

/**
 * POST /api/audits/:id/inventory-session/scan
 * Records physical barcode scan with duplicate prevention & shelf validation.
 */
router.post('/:id/inventory-session/scan', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { barcode, scannedShelf, notes } = req.body;
    const actorId = req.user?.id || 'system';

    const result = await InventoryAuditService.recordScan(
      id,
      {
        barcode,
        scannedShelf,
        notes,
      },
      actorId
    );

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Error recording inventory scan:', error);
    res.status(error.status || 500).json({
      error: error.error || error.message || 'Internal server error',
      data: error.data,
    });
  }
});

/**
 * POST /api/audits/:id/inventory-session/finalize
 * Finalizes session and generates formal AuditDiscrepancy records without mutating BookCopy records.
 */
router.post('/:id/inventory-session/finalize', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const actorId = req.user?.id || 'system';

    const result = await InventoryAuditService.finalizeSession(id, actorId);

    res.status(200).json({
      success: true,
      message: result.message,
      data: result,
    });
  } catch (error: any) {
    console.error('Error finalizing inventory audit session:', error);
    res.status(error.status || 500).json({ error: error.error || error.message || 'Internal server error' });
  }
});

// ─── Evidence & Reporting CSV Export (Sub-Phase 11F) ─────────────────

/**
 * GET /api/audits/:id/export
 * Exports audit evidence (summary, discrepancies, or scans) as an RFC 4180 CSV with formula defense.
 */
router.get('/:id/export', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { type = 'summary' } = req.query;

    const audit = await AuditService.getAuditById(id);
    const exportType = String(type).toLowerCase();

    if (exportType === 'discrepancies') {
      const { discrepancies } = await DiscrepancyService.getDiscrepancies({
        auditId: id,
        limit: 1000,
      });

      const columns = [
        { key: 'auditNumber', header: 'Audit Number', formatter: () => audit.auditNumber },
        { key: 'barcode', header: 'Barcode', formatter: (r: any) => r.barcode || 'N/A' },
        { key: 'title', header: 'Book Title', formatter: (r: any) => r.book?.title || 'Unregistered / Unknown' },
        { key: 'category', header: 'Category', formatter: (r: any) => r.category },
        { key: 'severity', header: 'Severity', formatter: (r: any) => r.severity },
        { key: 'status', header: 'Status', formatter: (r: any) => r.status },
        {
          key: 'discoveredDate',
          header: 'Discovered Date',
          formatter: (r: any) => (r.discoveredDate instanceof Date ? r.discoveredDate.toISOString().slice(0, 10) : String(r.discoveredDate).slice(0, 10)),
        },
        { key: 'description', header: 'Description', formatter: (r: any) => r.description },
        { key: 'resolutionNotes', header: 'Resolution Notes', formatter: (r: any) => r.resolutionNotes || 'None' },
      ];

      const csv = generateCsv(discrepancies, columns, { includeBom: true, neutralizeFormulas: true });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${audit.auditNumber}_discrepancies_${new Date().toISOString().slice(0, 10)}.csv"`
      );
      res.send(csv);
      return;
    }

    if (exportType === 'scans') {
      const summary = await InventoryAuditService.getSessionSummary(id);
      const scans = summary.recentScans || [];

      const columns = [
        { key: 'barcode', header: 'Barcode', formatter: (r: any) => r.barcode },
        { key: 'title', header: 'Book Title', formatter: (r: any) => r.bookCopy?.book?.title || 'Unregistered' },
        { key: 'matchStatus', header: 'Match Status', formatter: (r: any) => r.matchStatus },
        { key: 'scannedShelf', header: 'Scanned Shelf', formatter: (r: any) => r.scannedShelf || 'N/A' },
        {
          key: 'scannedAt',
          header: 'Scanned At',
          formatter: (r: any) => (r.scannedAt instanceof Date ? r.scannedAt.toISOString() : String(r.scannedAt)),
        },
        { key: 'notes', header: 'Notes', formatter: (r: any) => r.notes || '' },
      ];

      const csv = generateCsv(scans, columns, { includeBom: true, neutralizeFormulas: true });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${audit.auditNumber}_inventory_scans_${new Date().toISOString().slice(0, 10)}.csv"`
      );
      res.send(csv);
      return;
    }

    // Default: summary metrics export
    const { report } = await AuditService.getAuditReport(id);

    const rows = [
      { metric: 'Institution', value: 'R.G. Kedia College of Commerce' },
      { metric: 'Affiliation', value: 'Osmania University, Hyderabad' },
      { metric: 'Audit Number', value: audit.auditNumber },
      { metric: 'Audit Type', value: audit.type },
      { metric: 'Title', value: audit.title },
      { metric: 'Academic Year', value: audit.academicYear || 'N/A' },
      { metric: 'Status', value: audit.status },
      { metric: 'Period Start', value: audit.periodStart.toISOString().slice(0, 10) },
      { metric: 'Period End', value: audit.periodEnd.toISOString().slice(0, 10) },
      { metric: 'Lead Librarian', value: audit.leadLibrarian?.name || 'N/A' },
      { metric: 'Total Titles', value: report.collection.totalTitles },
      { metric: 'Total Book Copies', value: report.collection.totalCopies },
      { metric: 'Active Eligible Copies', value: report.collection.activeCopies },
      { metric: 'Available Copies', value: report.collection.availableCopies },
      { metric: 'Issued Copies', value: report.collection.issuedCopies },
      { metric: 'Lost Copies', value: report.collection.lostCopies },
      { metric: 'Damaged Copies', value: report.collection.damagedCopies },
      { metric: 'Withdrawn Copies', value: report.collection.withdrawnCopies },
      { metric: 'Shelf Location Coverage (%)', value: report.collection.shelfLocationCoveragePercentage },
      { metric: 'Total Circulations Issued', value: report.circulation.totalIssued },
      { metric: 'Total Circulations Returned', value: report.circulation.totalReturned },
      { metric: 'Total Circulations Renewed', value: report.circulation.totalRenewals },
      { metric: 'Total Overdue Loans', value: report.overdueAging.totalOverdueLoans },
      { metric: 'Affected Overdue Borrowers', value: report.overdueAging.affectedBorrowers },
      { metric: 'Good Condition Copies', value: report.conditionGrades.good },
      { metric: 'Fair Condition Copies', value: report.conditionGrades.fair },
      { metric: 'Poor Condition Copies', value: report.conditionGrades.poor },
      { metric: 'Damaged Condition Copies', value: report.conditionGrades.damaged },
    ];

    if (report.annualInstitutional) {
      rows.push(
        { metric: 'Annual Program Circulation - B.Com', value: report.annualInstitutional.programCirculation.bcom },
        { metric: 'Annual Program Circulation - BBA', value: report.annualInstitutional.programCirculation.bba },
        { metric: 'Annual Program Circulation - B.Sc', value: report.annualInstitutional.programCirculation.bsc },
        { metric: 'Annual Program Circulation - Faculty', value: report.annualInstitutional.programCirculation.faculty },
        {
          metric: 'Interim Audits Completed in AY',
          value: report.annualInstitutional.regulatoryCompliance.totalInterimAuditsCompleted,
        },
        {
          metric: 'Discrepancy Reconciliation Rate (%)',
          value: report.annualInstitutional.regulatoryCompliance.reconciliationRatePercentage,
        }
      );
    }

    const columns = [
      { key: 'metric', header: 'Metric' },
      { key: 'value', header: 'Value' },
    ];

    const csv = generateCsv(rows, columns, { includeBom: true, neutralizeFormulas: true });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${audit.auditNumber}_summary_${new Date().toISOString().slice(0, 10)}.csv"`
    );
    res.send(csv);
  } catch (error: any) {
    console.error('Error exporting audit CSV:', error);
    res.status(error.status || 500).json({ error: error.error || error.message || 'Internal server error' });
  }
});

export default router;

