import { PrismaClient, Prisma } from '@prisma/client';
import { logAdminAction } from '../lib/auditLogger.js';
import { ReportingService } from './reportingService.js';

const prisma = new PrismaClient();

export const AUDIT_TYPES = {
  MONTHLY: 'MONTHLY',
  QUARTERLY: 'QUARTERLY',
  SEMI_ANNUAL_INVENTORY: 'SEMI_ANNUAL_INVENTORY',
  ANNUAL: 'ANNUAL',
} as const;

export type AuditType = (typeof AUDIT_TYPES)[keyof typeof AUDIT_TYPES];

export const AUDIT_STATUSES = {
  NOT_STARTED: 'NOT_STARTED',
  IN_PROGRESS: 'IN_PROGRESS',
  PENDING_RECONCILIATION: 'PENDING_RECONCILIATION',
  COMPLETED: 'COMPLETED',
  CLOSED: 'CLOSED',
} as const;

export type AuditStatus = (typeof AUDIT_STATUSES)[keyof typeof AUDIT_STATUSES];

// Valid state machine transitions
export const ALLOWED_STATUS_TRANSITIONS: Record<AuditStatus, AuditStatus[]> = {
  NOT_STARTED: ['IN_PROGRESS'],
  IN_PROGRESS: ['PENDING_RECONCILIATION', 'COMPLETED'],
  PENDING_RECONCILIATION: ['COMPLETED', 'IN_PROGRESS'],
  COMPLETED: ['CLOSED'],
  CLOSED: [], // Terminal state
};

export interface CreateAuditDTO {
  type: AuditType;
  title: string;
  periodStart: Date;
  periodEnd: Date;
  academicYear?: string;
  leadLibrarianId: string;
  observations?: string;
  recommendations?: string;
}

export interface AuditListFilters {
  type?: AuditType;
  status?: AuditStatus;
  academicYear?: string;
  page?: number;
  limit?: number;
}

export interface AuditDashboardMetrics {
  totalAudits: number;
  completedAudits: number;
  inProgressAudits: number;
  pendingReconciliationAudits: number;
  openDiscrepancies: number;
  byType: {
    monthly: number;
    quarterly: number;
    semiAnnualInventory: number;
    annual: number;
  };
  recentAudits: Array<{
    id: string;
    auditNumber: string;
    type: string;
    title: string;
    status: string;
    periodStart: string;
    periodEnd: string;
    leadLibrarianName: string;
    discrepancyCount: number;
    createdAt: string;
  }>;
}

export class AuditService {
  /**
   * Generates a collision-resistant, standardized institutional audit identifier.
   * e.g., AUD-2026-M10-001, AUD-2026-Q03-001, AUD-2026-INV-001, AUD-2026-ANN-001
   */
  public static async generateAuditNumber(type: AuditType, date: Date = new Date()): Promise<string> {
    const year = date.getUTCFullYear();
    let prefix = 'AUD';
    let typeCode = 'M';

    if (type === AUDIT_TYPES.MONTHLY) {
      const monthStr = String(date.getUTCMonth() + 1).padStart(2, '0');
      typeCode = `M${monthStr}`;
    } else if (type === AUDIT_TYPES.QUARTERLY) {
      const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
      typeCode = `Q0${quarter}`;
    } else if (type === AUDIT_TYPES.SEMI_ANNUAL_INVENTORY) {
      typeCode = 'INV';
    } else if (type === AUDIT_TYPES.ANNUAL) {
      typeCode = 'ANN';
    }

    const basePrefix = `${prefix}-${year}-${typeCode}`;

    // Count existing audits with this prefix to assign next monotonic sequence
    const existingCount = await prisma.libraryAudit.count({
      where: {
        auditNumber: {
          startsWith: basePrefix,
        },
      },
    });

    const seq = String(existingCount + 1).padStart(3, '0');
    return `${basePrefix}-${seq}`;
  }

  /**
   * Creates a new Library Audit engagement.
   * Enforces period validity and duplicate prevention.
   */
  public static async createAudit(dto: CreateAuditDTO, actorId: string): Promise<any> {
    const { type, title, periodStart, periodEnd, academicYear, leadLibrarianId, observations, recommendations } = dto;

    if (!Object.values(AUDIT_TYPES).includes(type)) {
      throw { status: 400, error: `Invalid audit type. Allowed types: ${Object.values(AUDIT_TYPES).join(', ')}` };
    }

    if (!title || !title.trim()) {
      throw { status: 400, error: 'Audit title is required.' };
    }

    if (!(periodStart instanceof Date) || isNaN(periodStart.getTime()) || !(periodEnd instanceof Date) || isNaN(periodEnd.getTime())) {
      throw { status: 400, error: 'Valid periodStart and periodEnd dates are required.' };
    }

    if (periodStart > periodEnd) {
      throw { status: 400, error: 'periodStart cannot be after periodEnd.' };
    }

    // Duplicate Audit Prevention:
    // Check if an active audit (not CLOSED) already exists for the exact same type and period
    const duplicate = await prisma.libraryAudit.findFirst({
      where: {
        type,
        periodStart,
        periodEnd,
        status: { not: AUDIT_STATUSES.CLOSED },
      },
    });

    if (duplicate) {
      throw {
        status: 409,
        error: `An active audit (${duplicate.auditNumber}) already exists for ${type} covering ${periodStart.toISOString().slice(0, 10)} to ${periodEnd.toISOString().slice(0, 10)}.`,
      };
    }

    // Verify lead librarian exists and is a LIBRARIAN
    const librarian = await prisma.user.findUnique({
      where: { id: leadLibrarianId },
      select: { id: true, role: true, active: true },
    });

    if (!librarian || librarian.role !== 'LIBRARIAN' || !librarian.active) {
      throw { status: 400, error: 'Lead librarian must be an active user with LIBRARIAN role.' };
    }

    const auditNumber = await this.generateAuditNumber(type, periodStart);

    const audit = await prisma.libraryAudit.create({
      data: {
        auditNumber,
        type,
        title: title.trim(),
        periodStart,
        periodEnd,
        academicYear: academicYear?.trim() || null,
        leadLibrarianId,
        observations: observations?.trim() || null,
        recommendations: recommendations?.trim() || null,
        status: AUDIT_STATUSES.NOT_STARTED,
      },
      include: {
        leadLibrarian: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    // Record administrative audit trail
    await logAdminAction({
      actorId,
      action: 'LIBRARY_AUDIT_CREATED',
      targetId: audit.id,
      details: {
        auditNumber: audit.auditNumber,
        type: audit.type,
        periodStart: audit.periodStart.toISOString(),
        periodEnd: audit.periodEnd.toISOString(),
      },
    });

    return audit;
  }

  /**
   * Retrieves paginated list of audits with optional filters.
   */
  public static async getAudits(filters: AuditListFilters = {}): Promise<{
    audits: any[];
    pagination: { total: number; page: number; limit: number; totalPages: number };
  }> {
    const { type, status, academicYear, page = 1, limit = 20 } = filters;

    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
    const skip = (safePage - 1) * safeLimit;

    const where: Prisma.LibraryAuditWhereInput = {};
    if (type && Object.values(AUDIT_TYPES).includes(type)) {
      where.type = type;
    }
    if (status && Object.values(AUDIT_STATUSES).includes(status)) {
      where.status = status;
    }
    if (academicYear) {
      where.academicYear = academicYear;
    }

    const [total, audits] = await Promise.all([
      prisma.libraryAudit.count({ where }),
      prisma.libraryAudit.findMany({
        where,
        skip,
        take: safeLimit,
        orderBy: { periodStart: 'desc' },
        include: {
          leadLibrarian: {
            select: { id: true, name: true, email: true },
          },
          _count: {
            select: {
              discrepancies: true,
            },
          },
        },
      }),
    ]);

    const formattedAudits = audits.map((a) => ({
      ...a,
      discrepancyCount: a._count.discrepancies,
    }));

    return {
      audits: formattedAudits,
      pagination: {
        total,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.ceil(total / safeLimit) || 1,
      },
    };
  }

  /**
   * Retrieves a single audit by its unique ID, including inventory session and discrepancy metrics.
   */
  public static async getAuditById(id: string): Promise<any> {
    if (!id || typeof id !== 'string') {
      throw { status: 400, error: 'Invalid audit ID parameter.' };
    }

    const audit = await prisma.libraryAudit.findUnique({
      where: { id },
      include: {
        leadLibrarian: {
          select: { id: true, name: true, email: true },
        },
        inventorySession: {
          select: {
            id: true,
            status: true,
            startedAt: true,
            completedAt: true,
            totalExpected: true,
            totalScanned: true,
            totalMatched: true,
            totalMissing: true,
            totalIssued: true,
            totalSurplus: true,
            totalDiscrepancy: true,
          },
        },
        discrepancies: {
          orderBy: { discoveredDate: 'desc' },
          take: 50,
          include: {
            book: { select: { id: true, title: true, author: true } },
            bookCopy: { select: { id: true, copyNumber: true, barcode: true, condition: true, status: true, shelfLocation: true } },
            correctiveActions: {
              orderBy: { actionDate: 'desc' },
              include: { performedBy: { select: { id: true, name: true } } },
            },
          },
        },
      },
    });

    if (!audit) {
      throw { status: 404, error: 'Library audit not found.' };
    }

    return audit;
  }

  /**
   * Advances or updates the lifecycle status of an audit with strict state machine verification.
   */
  public static async updateAuditStatus(
    id: string,
    newStatus: AuditStatus,
    actorId: string,
    options: { observations?: string; recommendations?: string; snapshotData?: any } = {}
  ): Promise<any> {
    const audit = await prisma.libraryAudit.findUnique({
      where: { id },
    });

    if (!audit) {
      throw { status: 404, error: 'Library audit not found.' };
    }

    const currentStatus = audit.status as AuditStatus;

    if (currentStatus === AUDIT_STATUSES.CLOSED) {
      throw { status: 400, error: 'Audit is already CLOSED. Closed audits cannot be altered or reopened.' };
    }

    if (currentStatus === newStatus) {
      return audit; // Idempotent no-op
    }

    const allowedNext = ALLOWED_STATUS_TRANSITIONS[currentStatus] || [];
    if (!allowedNext.includes(newStatus)) {
      throw {
        status: 400,
        error: `Invalid status transition from "${currentStatus}" to "${newStatus}". Allowed transitions: ${allowedNext.join(', ') || 'none'}.`,
      };
    }

    const updateData: Prisma.LibraryAuditUpdateInput = {
      status: newStatus,
    };

    if (options.observations !== undefined) {
      updateData.observations = options.observations ? options.observations.trim() : null;
    }
    if (options.recommendations !== undefined) {
      updateData.recommendations = options.recommendations ? options.recommendations.trim() : null;
    }

    if (newStatus === AUDIT_STATUSES.COMPLETED) {
      updateData.completedAt = new Date();
      if (options.snapshotData) {
        updateData.snapshotData = typeof options.snapshotData === 'string'
          ? options.snapshotData
          : JSON.stringify(options.snapshotData);
      }
    } else if (newStatus === AUDIT_STATUSES.CLOSED) {
      updateData.closedAt = new Date();
    }

    const updated = await prisma.libraryAudit.update({
      where: { id },
      data: updateData,
      include: {
        leadLibrarian: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    // Record administrative audit trail
    await logAdminAction({
      actorId,
      action: 'LIBRARY_AUDIT_STATUS_UPDATED',
      targetId: updated.id,
      details: {
        auditNumber: updated.auditNumber,
        previousStatus: currentStatus,
        newStatus,
      },
    });

    return updated;
  }

  /**
   * Updates observations or recommendations without changing lifecycle status.
   */
  public static async updateAuditNotes(
    id: string,
    notes: { observations?: string; recommendations?: string },
    actorId: string
  ): Promise<any> {
    const audit = await prisma.libraryAudit.findUnique({
      where: { id },
    });

    if (!audit) {
      throw { status: 404, error: 'Library audit not found.' };
    }

    if (audit.status === AUDIT_STATUSES.CLOSED) {
      throw { status: 400, error: 'Audit is CLOSED. Observations on closed audits cannot be modified.' };
    }

    const updated = await prisma.libraryAudit.update({
      where: { id },
      data: {
        ...(notes.observations !== undefined ? { observations: notes.observations?.trim() || null } : {}),
        ...(notes.recommendations !== undefined ? { recommendations: notes.recommendations?.trim() || null } : {}),
      },
      include: {
        leadLibrarian: { select: { id: true, name: true, email: true } },
      },
    });

    await logAdminAction({
      actorId,
      action: 'LIBRARY_AUDIT_NOTES_UPDATED',
      targetId: id,
      details: { auditNumber: audit.auditNumber },
    });

    return updated;
  }

  /**
   * Aggregates high-level dashboard metrics for the Librarian Audit Dashboard.
   */
  public static async getDashboardMetrics(): Promise<AuditDashboardMetrics> {
    const [
      totalAudits,
      completedAudits,
      inProgressAudits,
      pendingReconciliationAudits,
      openDiscrepancies,
      monthlyCount,
      quarterlyCount,
      semiAnnualCount,
      annualCount,
      recentAuditsRaw,
    ] = await Promise.all([
      prisma.libraryAudit.count(),
      prisma.libraryAudit.count({ where: { status: { in: [AUDIT_STATUSES.COMPLETED, AUDIT_STATUSES.CLOSED] } } }),
      prisma.libraryAudit.count({ where: { status: AUDIT_STATUSES.IN_PROGRESS } }),
      prisma.libraryAudit.count({ where: { status: AUDIT_STATUSES.PENDING_RECONCILIATION } }),
      prisma.auditDiscrepancy.count({ where: { status: { not: 'CLOSED' } } }),
      prisma.libraryAudit.count({ where: { type: AUDIT_TYPES.MONTHLY } }),
      prisma.libraryAudit.count({ where: { type: AUDIT_TYPES.QUARTERLY } }),
      prisma.libraryAudit.count({ where: { type: AUDIT_TYPES.SEMI_ANNUAL_INVENTORY } }),
      prisma.libraryAudit.count({ where: { type: AUDIT_TYPES.ANNUAL } }),
      prisma.libraryAudit.findMany({
        take: 6,
        orderBy: { createdAt: 'desc' },
        include: {
          leadLibrarian: { select: { name: true } },
          _count: { select: { discrepancies: true } },
        },
      }),
    ]);

    const recentAudits = recentAuditsRaw.map((a) => ({
      id: a.id,
      auditNumber: a.auditNumber,
      type: a.type,
      title: a.title,
      status: a.status,
      periodStart: a.periodStart.toISOString(),
      periodEnd: a.periodEnd.toISOString(),
      leadLibrarianName: a.leadLibrarian?.name || 'Unknown',
      discrepancyCount: a._count.discrepancies,
      createdAt: a.createdAt.toISOString(),
    }));

    return {
      totalAudits,
      completedAudits,
      inProgressAudits,
      pendingReconciliationAudits,
      openDiscrepancies,
      byType: {
        monthly: monthlyCount,
        quarterly: quarterlyCount,
        semiAnnualInventory: semiAnnualCount,
        annual: annualCount,
      },
      recentAudits,
    };
  }

  /**
   * Compiles monthly or quarterly operational data for an audit engagement.
   * If the audit is completed or closed, returns the frozen snapshot.
   */
  public static async getAuditReport(auditId: string): Promise<any> {
    const audit = await this.getAuditById(auditId);

    // If completed or closed and has frozen snapshot data, return frozen snapshot
    if ((audit.status === AUDIT_STATUSES.COMPLETED || audit.status === AUDIT_STATUSES.CLOSED) && audit.snapshotData) {
      try {
        const frozenData = JSON.parse(audit.snapshotData);
        return {
          audit,
          report: frozenData,
          isFrozenSnapshot: true,
        };
      } catch (err) {
        console.error('Failed to parse snapshotData JSON:', err);
      }
    }

    // Otherwise compile live dynamic report
    const liveReport = await this.compileLiveReport(audit);
    return {
      audit,
      report: liveReport,
      isFrozenSnapshot: false,
    };
  }

  /**
   * Freezes an audit operational report into immutable snapshotData JSON.
   */
  public static async freezeAuditSnapshot(auditId: string, actorId: string): Promise<any> {
    const audit = await this.getAuditById(auditId);

    if (audit.status === AUDIT_STATUSES.CLOSED) {
      throw { status: 400, error: 'Cannot compile snapshot on a CLOSED audit.' };
    }

    const report = await this.compileLiveReport(audit);
    const snapshotJson = JSON.stringify(report);

    const updated = await prisma.libraryAudit.update({
      where: { id: auditId },
      data: {
        snapshotData: snapshotJson,
      },
      include: {
        leadLibrarian: { select: { id: true, name: true, email: true } },
      },
    });

    await logAdminAction({
      actorId,
      action: 'LIBRARY_AUDIT_SNAPSHOT_COMPILED',
      targetId: audit.id,
      details: {
        auditNumber: audit.auditNumber,
        compiledAt: report.compiledAt,
      },
    });

    return {
      success: true,
      audit: updated,
      report,
    };
  }

  /**
   * Compiles live operational data from circulation, inventory, and delinquency subsystems.
   */
  private static async compileLiveReport(audit: any): Promise<any> {
    const { periodStart, periodEnd, type } = audit;
    const isQuarterly = type === AUDIT_TYPES.QUARTERLY;

    // Run parallel aggregation queries
    const [
      circulationSummary,
      inventoryAnalytics,
      overdueLossReport,
      totalTitlesCount,
      newBooksCount,
      topBorrowedTitles,
      adminLogsCount,
    ] = await Promise.all([
      ReportingService.getCirculationSummary({
        startDate: periodStart,
        endDate: periodEnd,
        period: isQuarterly ? 'MONTHLY' : 'DAILY',
      }),
      ReportingService.getInventoryAnalytics({
        startDate: periodStart,
        endDate: periodEnd,
      }),
      ReportingService.getOverdueAndLossReport({
        asOfDate: periodEnd,
        startDate: periodStart,
        endDate: periodEnd,
      }),
      prisma.book.count(),
      prisma.book.count({
        where: {
          createdAt: {
            gte: periodStart,
            lte: periodEnd,
          },
        },
      }),
      ReportingService.getTopBorrowedTitles({
        startDate: periodStart,
        endDate: periodEnd,
        limit: 10,
      }),
      prisma.auditLog.count({
        where: {
          timestamp: {
            gte: periodStart,
            lte: periodEnd,
          },
        },
      }),
    ]);

    const conditionData = inventoryAnalytics.inventoryCondition;
    const shelfData = inventoryAnalytics.shelfAudit;

    // Sub-Phase 11E: Annual Institutional Audit consolidation for Osmania University academic year
    let annualInstitutional: any = undefined;
    if (type === AUDIT_TYPES.ANNUAL) {
      const [academicYearAudits, lendingsInAy, priorAnnualAudit, ayDiscrepancies] = await Promise.all([
        prisma.libraryAudit.findMany({
          where: {
            id: { not: audit.id },
            periodStart: { gte: periodStart },
            periodEnd: { lte: periodEnd },
          },
          select: {
            id: true,
            auditNumber: true,
            type: true,
            status: true,
            title: true,
          },
        }),
        prisma.lending.findMany({
          where: {
            issuedDate: {
              gte: periodStart,
              lte: periodEnd,
            },
          },
          include: {
            user: {
              select: {
                role: true,
                program: true,
                branch: true,
              },
            },
          },
        }),
        prisma.libraryAudit.findFirst({
          where: {
            type: AUDIT_TYPES.ANNUAL,
            periodEnd: { lt: periodStart },
            status: { in: [AUDIT_STATUSES.COMPLETED, AUDIT_STATUSES.CLOSED] },
          },
          orderBy: { periodEnd: 'desc' },
        }),
        prisma.auditDiscrepancy.findMany({
          where: {
            discoveredDate: {
              gte: periodStart,
              lte: periodEnd,
            },
          },
          select: {
            id: true,
            status: true,
            category: true,
            severity: true,
          },
        }),
      ]);

      // 1. Program circulation distribution
      const programCirculation: Record<string, number> = {
        BCOM: 0,
        BBA: 0,
        BSC: 0,
        FACULTY: 0,
        OTHER: 0,
      };

      for (const loan of lendingsInAy) {
        if (loan.user?.role === 'TEACHER') {
          programCirculation.FACULTY += 1;
        } else if (loan.user?.program === 'BCOM') {
          programCirculation.BCOM += 1;
        } else if (loan.user?.program === 'BBA') {
          programCirculation.BBA += 1;
        } else if (loan.user?.program === 'BSC') {
          programCirculation.BSC += 1;
        } else {
          programCirculation.OTHER += 1;
        }
      }

      // 2. Regulatory Compliance Tracking
      const monthlyCount = academicYearAudits.filter((a) => a.type === AUDIT_TYPES.MONTHLY).length;
      const quarterlyCount = academicYearAudits.filter((a) => a.type === AUDIT_TYPES.QUARTERLY).length;
      const inventoryCount = academicYearAudits.filter((a) => a.type === AUDIT_TYPES.SEMI_ANNUAL_INVENTORY).length;
      const completedAuditsCount = academicYearAudits.filter(
        (a) => a.status === AUDIT_STATUSES.COMPLETED || a.status === AUDIT_STATUSES.CLOSED
      ).length;

      const totalDiscrepancies = ayDiscrepancies.length;
      const resolvedDiscrepancies = ayDiscrepancies.filter(
        (d) => d.status === 'RESOLVED' || d.status === 'CLOSED'
      ).length;

      // 3. Prior Year Comparative Analysis
      let priorYearComparison: any = {
        baselineAvailable: false,
        priorAuditNumber: null,
        priorAcademicYear: null,
        disclosure: 'Prior year baseline comparison unavailable; current academic year establishes baseline.',
      };

      if (priorAnnualAudit && priorAnnualAudit.snapshotData) {
        try {
          const priorData = JSON.parse(priorAnnualAudit.snapshotData);
          const priorCirculation = priorData.circulation?.netCirculation || priorData.circulation?.totalIssued || 0;
          const currentCirculation = circulationSummary.totals.netCirculation;
          const priorCopies = priorData.collection?.totalCopies || 0;
          const currentCopies = conditionData.totalAllCopiesCount;

          const circulationGrowth =
            priorCirculation > 0
              ? Number((((currentCirculation - priorCirculation) / priorCirculation) * 100).toFixed(2))
              : null;
          const collectionGrowth =
            priorCopies > 0
              ? Number((((currentCopies - priorCopies) / priorCopies) * 100).toFixed(2))
              : null;

          priorYearComparison = {
            baselineAvailable: true,
            priorAuditNumber: priorAnnualAudit.auditNumber,
            priorAcademicYear: priorAnnualAudit.academicYear,
            priorCirculation,
            currentCirculation,
            circulationGrowthPercentage: circulationGrowth,
            priorCopies,
            currentCopies,
            collectionGrowthPercentage: collectionGrowth,
            disclosure: 'Comparative analysis successfully reconciled with archived institutional audit records.',
          };
        } catch (e) {
          console.warn('Failed to parse prior annual audit snapshot:', e);
        }
      }

      annualInstitutional = {
        academicYear: audit.academicYear || `${periodStart.getUTCFullYear()}-${periodEnd.getUTCFullYear()}`,
        institution: 'R.G. Kedia College of Commerce',
        affiliation: 'Osmania University, Hyderabad',
        collectionDevelopment: {
          openingTitlesEstimated: Math.max(0, totalTitlesCount - newBooksCount),
          acquisitionsInAcademicYear: newBooksCount,
          closingTitles: totalTitlesCount,
          closingCopies: conditionData.totalAllCopiesCount,
          lossesAndDamaged: conditionData.statusDistribution.lost + conditionData.statusDistribution.damaged,
          withdrawnCopies: conditionData.withdrawnCopiesCount,
        },
        programCirculation: {
          bcom: programCirculation.BCOM,
          bba: programCirculation.BBA,
          bsc: programCirculation.BSC,
          faculty: programCirculation.FACULTY,
          other: programCirculation.OTHER,
          totalLendingsInAcademicYear: lendingsInAy.length,
        },
        regulatoryCompliance: {
          monthlyAuditsConducted: monthlyCount,
          quarterlyReviewsConducted: quarterlyCount,
          semiAnnualInventoryAuditsConducted: inventoryCount,
          totalInterimAuditsCompleted: completedAuditsCount,
          totalDiscrepanciesLogged: totalDiscrepancies,
          discrepanciesResolved: resolvedDiscrepancies,
          reconciliationRatePercentage:
            totalDiscrepancies > 0 ? Math.round((resolvedDiscrepancies / totalDiscrepancies) * 100) : 100,
        },
        priorYearComparison,
      };
    }

    const reportData = {
      auditId: audit.id,
      auditNumber: audit.auditNumber,
      auditType: audit.type,
      title: audit.title,
      compiledAt: new Date().toISOString(),
      coveragePeriod: {
        start: periodStart.toISOString(),
        end: periodEnd.toISOString(),
      },
      academicYear: audit.academicYear || null,
      leadLibrarian: audit.leadLibrarian?.name || 'Authorized Librarian',

      // Collection & Catalog Inventory
      collection: {
        totalTitles: totalTitlesCount,
        totalCopies: conditionData.totalAllCopiesCount,
        activeCopies: conditionData.eligibleActiveCopiesCount,
        availableCopies: conditionData.statusDistribution.available,
        issuedCopies: conditionData.statusDistribution.issued,
        reservedCopies: conditionData.statusDistribution.reserved,
        lostCopies: conditionData.statusDistribution.lost,
        damagedCopies: conditionData.statusDistribution.damaged,
        withdrawnCopies: conditionData.withdrawnCopiesCount,
        shelfLocationCoveragePercentage: shelfData.catalogLocationSummary.shelfLocationCoveragePercentage,
        newTitlesAcquired: newBooksCount,
      },

      // Circulation Activity
      circulation: {
        totalIssued: circulationSummary.totals.totalIssued,
        totalReturned: circulationSummary.totals.totalReturned,
        totalRenewals: circulationSummary.totals.totalRenewals,
        netCirculation: circulationSummary.totals.netCirculation,
        breakdown: circulationSummary.breakdown,
      },

      // Delinquency & Overdue Aging
      overdueAging: {
        totalOverdueLoans: overdueLossReport.overdueSummary.totalOverdueLoans,
        affectedBorrowers: overdueLossReport.overdueSummary.affectedBorrowersCount,
        agingDistribution: overdueLossReport.overdueSummary.agingDistribution,
        finePolicyNotice: overdueLossReport.fineReconciliation.complianceNote,
      },

      // Physical Inventory Condition Grade Breakdown
      conditionGrades: {
        good: conditionData.conditionDistribution.good.count,
        fair: conditionData.conditionDistribution.fair.count,
        poor: conditionData.conditionDistribution.poor.count,
        damaged: conditionData.conditionDistribution.damaged.count,
      },

      // Quarterly Consolidation / Top Borrowed
      topBorrowedTitles: topBorrowedTitles.titles,
      quarterlyBreakdown: isQuarterly ? circulationSummary.breakdown : undefined,
      annualInstitutional,
      administrativeActivityCount: adminLogsCount,
    };

    return reportData;
  }

}
