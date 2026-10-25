import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export type PeriodType = 'DAILY' | 'WEEKLY' | 'MONTHLY';

export interface CirculationSummaryFilters {
  startDate: Date;
  endDate: Date;
  period?: PeriodType;
}

export interface CirculationPeriodBucket {
  period: string; // e.g. "2026-10-25" (DAILY), "2026-W43" (WEEKLY), "2026-10" (MONTHLY)
  issuedCount: number;
  returnedCount: number;
  renewalCount: number;
  netCirculation: number;
}

export interface CirculationSummaryResult {
  startDate: string;
  endDate: string;
  period: PeriodType;
  totals: {
    totalIssued: number;
    totalReturned: number;
    totalRenewals: number;
    netCirculation: number;
  };
  breakdown: CirculationPeriodBucket[];
}

export interface TopBorrowedTitlesFilters {
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  programId?: string; // program filter, e.g. "BCOM", "BBA", "BSC"
}

export interface TopBorrowedTitleItem {
  bookId: string;
  title: string;
  author: string;
  isbn: string | null;
  category: string;
  borrowCount: number;
  programs: string[];
}

export interface TopBorrowedTitlesResult {
  filters: {
    startDate: string | null;
    endDate: string | null;
    limit: number;
    programId: string | null;
  };
  totalTitles: number;
  titles: TopBorrowedTitleItem[];
}

// ─── Phase 10B Overdue & Loss Analytics Interfaces ──────────────────────────

export interface OverdueAndLossFilters {
  asOfDate?: Date; // Reference evaluation date (defaults to new Date())
  startDate?: Date; // Optional filter window start
  endDate?: Date; // Optional filter window end
  programId?: string; // Optional program filter (e.g., "BCOM", "BBA", "BSC")
}

export interface OverdueAgingBuckets {
  tier1To7Days: number;
  tier8To14Days: number;
  tier15To30Days: number;
  tier31PlusDays: number;
  tier30PlusDays: number; // Retained for backward compatibility
}

export interface OverdueItemSummary {
  lendingId: string;
  bookId: string;
  bookTitle: string;
  copyNumber: number;
  barcode: string | null;
  borrowerRole: string;
  borrowerProgram: string | null;
  borrowerBranch: string | null;
  borrowerYear: number | null;
  issuedDate: string;
  dueDate: string;
  daysOverdue: number;
  agingBucket: '1-7 days' | '8-14 days' | '15-30 days' | '31+ days' | '30+ days';
}

export interface LostAndDamagedInventorySummary {
  totalLostCopies: number;
  totalDamagedCopies: number;
  totalWithdrawnCopies: number;
  currentAvailableCopies: number;
  currentIssuedCopies: number;
  inventoryImpact: {
    totalActivePhysicalCopies: number;
    lostPercentageOfPhysical: number;
    damagedPercentageOfPhysical: number;
  };
  historicalLossRecordsCount: number;
  historicalDamagedRecordsCount: number;
  replacementHistoryStatus: {
    supportedBySchema: boolean;
    recordsFoundCount: number;
    limitationNote: string;
  };
}

export interface FineReconciliationSummary {
  policy: 'ZERO_MONETARY_FINES';
  policyCompliant: boolean | null; // null indicates unverified due to lack of authoritative database config
  totalAssessedFines: number;
  totalCollectedFines: number;
  totalOutstandingFines: number;
  monetaryLedgerSupported: boolean;
  authoritativeConfigFound: boolean;
  complianceNote: string;
  dataLimitation: string;
}

export interface OverdueAndLossReportResult {
  evaluationDate: string;
  filters: {
    asOfDate: string;
    startDate: string | null;
    endDate: string | null;
    programId: string | null;
  };
  overdueSummary: {
    totalOverdueLoans: number;
    affectedBorrowersCount: number;
    outstandingOverdueCopiesCount: number;
    agingDistribution: OverdueAgingBuckets;
    items: OverdueItemSummary[];
  };
  inventoryLossAndDamage: LostAndDamagedInventorySummary;
  fineReconciliation: FineReconciliationSummary;
}

// ─── Phase 10C Inventory Condition, Shelf-Audit & Drift Analytics Interfaces ──

export interface InventoryAnalyticsFilters {
  startDate?: Date; // Optional filter window start for audit events
  endDate?: Date; // Optional filter window end for audit events
  programId?: string; // Optional program filter (e.g., "BCOM", "BBA", "BSC")
}

export interface ConditionCategoryMetric {
  count: number;
  percentage: number;
}

export interface InventoryConditionDistribution {
  good: ConditionCategoryMetric;
  fair: ConditionCategoryMetric;
  poor: ConditionCategoryMetric;
  damaged: ConditionCategoryMetric;
  unknown: ConditionCategoryMetric;
}

export interface InventoryStatusDistribution {
  available: number;
  issued: number;
  reserved: number;
  lost: number;
  damaged: number;
}

export interface ConditionCrossStatusSummary {
  [condition: string]: {
    available: number;
    issued: number;
    reserved: number;
    lost: number;
    damaged: number;
  };
}

export interface InventoryConditionAnalytics {
  eligibleActiveCopiesCount: number; // status != 'WITHDRAWN'
  withdrawnCopiesCount: number; // status == 'WITHDRAWN'
  totalAllCopiesCount: number;
  supportedConditionGrades: string[]; // ['Good', 'Fair', 'Poor', 'Damaged']
  conditionDistribution: InventoryConditionDistribution;
  statusDistribution: InventoryStatusDistribution;
  crossStatusBreakdown: ConditionCrossStatusSummary;
  reconciliationSummary: {
    conditionCategoriesSum: number;
    eligibleActiveCopiesCount: number;
    isFullyReconciled: boolean;
  };
}

export interface ShelfAuditAnalytics {
  physicalObservationsRecorded: false;
  physicalObservationsCount: 0;
  misplacedCopiesDetectable: false;
  catalogLocationSummary: {
    totalActiveCopies: number;
    copiesWithShelfLocationCount: number;
    copiesWithoutShelfLocationCount: number;
    uniqueShelfLocationsCount: number;
    shelfLocationCoveragePercentage: number;
  };
  dataLimitation: string;
  minimumFutureRequirement: string;
}

export interface ReconciliationDriftAnalytics {
  reconciliationEventsCount: number;
  reconciledBooksCount: number;
  netTotalCopiesDrift: number;
  netAvailableCopiesDrift: number;
  positiveAdjustmentsCount: number;
  negativeAdjustmentsCount: number;
  zeroDriftAuditsCount: number;
  unparseableAuditLogsCount: number;
  eventsWindow: {
    startDate: string | null;
    endDate: string | null;
  };
  lifecycleEvents: {
    copyAdditionsCount: number;
    copyDeletionsCount: number;
    copyWithdrawalsCount: number;
    copyLostEventsCount: number;
    copyDamagedEventsCount: number;
  };
  limitationNote: string;
}

export interface InventoryCopyItem {
  copyId: string;
  bookId: string;
  bookTitle: string;
  copyNumber: number;
  barcode: string | null;
  condition: string;
  status: string;
  shelfLocation: string | null;
  programs: string[];
}

export interface InventoryAnalyticsReportResult {
  generatedAt: string;
  filters: {
    programId: string | null;
    startDate: string | null;
    endDate: string | null;
  };
  inventoryCondition: InventoryConditionAnalytics;
  shelfAudit: ShelfAuditAnalytics;
  reconciliationDrift: ReconciliationDriftAnalytics;
  copies: InventoryCopyItem[];
}

/**
 * Returns formatted period key for grouping.
 */
function getPeriodKey(date: Date, period: PeriodType): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');

  if (period === 'DAILY') {
    return `${year}-${month}-${day}`;
  }

  if (period === 'MONTHLY') {
    return `${year}-${month}`;
  }

  // WEEKLY: ISO-8601 week calculation
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = target.getTime();
  target.setUTCMonth(0, 1);
  if (target.getUTCDay() !== 4) {
    target.setUTCMonth(0, 1 + ((4 - target.getUTCDay() + 7) % 7));
  }
  const weekNumber = 1 + Math.ceil((firstThursday - target.getTime()) / 604800000);
  return `${year}-W${String(weekNumber).padStart(2, '0')}`;
}

export class ReportingService {
  /**
   * Aggregates circulation metrics (issued loans, returns, renewals, and net circulation)
   * grouped by time periods (DAILY, WEEKLY, MONTHLY) over a validated date range.
   */
  static async getCirculationSummary(
    filters: CirculationSummaryFilters
  ): Promise<CirculationSummaryResult> {
    const { startDate, endDate, period = 'DAILY' } = filters;

    // Fetch all lendings that intersect with the window (either issuedDate in range, or returnedDate in range)
    const lendings = await prisma.lending.findMany({
      where: {
        OR: [
          {
            issuedDate: {
              gte: startDate,
              lte: endDate,
            },
          },
          {
            returnedDate: {
              gte: startDate,
              lte: endDate,
            },
          },
        ],
      },
      select: {
        id: true,
        issuedDate: true,
        returnedDate: true,
        renewalCount: true,
        status: true,
      },
      orderBy: {
        issuedDate: 'asc',
      },
    });

    const bucketMap = new Map<
      string,
      { issuedCount: number; returnedCount: number; renewalCount: number }
    >();

    let totalIssued = 0;
    let totalReturned = 0;
    let totalRenewals = 0;

    for (const record of lendings) {
      // 1. Process issuance if within the date window
      if (record.issuedDate >= startDate && record.issuedDate <= endDate) {
        const key = getPeriodKey(record.issuedDate, period);
        const existing = bucketMap.get(key) || { issuedCount: 0, returnedCount: 0, renewalCount: 0 };
        existing.issuedCount += 1;
        existing.renewalCount += record.renewalCount || 0;
        bucketMap.set(key, existing);

        totalIssued += 1;
        totalRenewals += record.renewalCount || 0;
      }

      // 2. Process return if returnedDate is within the date window
      if (
        record.returnedDate &&
        record.returnedDate >= startDate &&
        record.returnedDate <= endDate
      ) {
        const returnKey = getPeriodKey(record.returnedDate, period);
        const existingReturn = bucketMap.get(returnKey) || {
          issuedCount: 0,
          returnedCount: 0,
          renewalCount: 0,
        };
        existingReturn.returnedCount += 1;
        bucketMap.set(returnKey, existingReturn);

        totalReturned += 1;
      }
    }

    // Sort periods chronologically
    const sortedKeys = Array.from(bucketMap.keys()).sort();
    const breakdown: CirculationPeriodBucket[] = sortedKeys.map((key) => {
      const stats = bucketMap.get(key)!;
      return {
        period: key,
        issuedCount: stats.issuedCount,
        returnedCount: stats.returnedCount,
        renewalCount: stats.renewalCount,
        netCirculation: stats.issuedCount - stats.returnedCount,
      };
    });

    return {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      period,
      totals: {
        totalIssued,
        totalReturned,
        totalRenewals,
        netCirculation: totalIssued - totalReturned,
      },
      breakdown,
    };
  }

  /**
   * Retrieves top borrowed book titles within an optional date window,
   * bounded limit (1-100), and optional program filter (e.g. BCOM, BBA, BSC).
   */
  static async getTopBorrowedTitles(
    filters: TopBorrowedTitlesFilters
  ): Promise<TopBorrowedTitlesResult> {
    const { startDate, endDate, limit = 10, programId } = filters;
    const boundedLimit = Math.max(1, Math.min(100, limit));

    // Construct lending filters
    const lendingWhere: any = {};
    if (startDate || endDate) {
      lendingWhere.issuedDate = {};
      if (startDate) lendingWhere.issuedDate.gte = startDate;
      if (endDate) lendingWhere.issuedDate.lte = endDate;
    }

    // Optional program filter matching BookProgram
    if (programId && programId.trim() !== '') {
      lendingWhere.bookCopy = {
        book: {
          bookPrograms: {
            some: {
              program: programId.trim().toUpperCase(),
            },
          },
        },
      };
    }

    // Fetch lendings with book copy and parent book metadata in single efficient join
    const lendings = await prisma.lending.findMany({
      where: lendingWhere,
      select: {
        id: true,
        bookCopy: {
          select: {
            book: {
              select: {
                id: true,
                title: true,
                author: true,
                isbn: true,
                category: true,
                bookPrograms: {
                  select: {
                    program: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    // Aggregate borrow count by book
    const bookBorrowMap = new Map<
      string,
      {
        book: {
          id: string;
          title: string;
          author: string;
          isbn: string | null;
          category: string;
          programs: Set<string>;
        };
        borrowCount: number;
      }
    >();

    for (const record of lendings) {
      const book = record.bookCopy?.book;
      if (!book) continue;

      const existing = bookBorrowMap.get(book.id);
      if (existing) {
        existing.borrowCount += 1;
      } else {
        const programs = new Set<string>();
        for (const bp of book.bookPrograms || []) {
          programs.add(bp.program);
        }
        bookBorrowMap.set(book.id, {
          book: {
            id: book.id,
            title: book.title,
            author: book.author,
            isbn: book.isbn,
            category: book.category,
            programs,
          },
          borrowCount: 1,
        });
      }
    }

    // Sort descending by borrowCount, then alphabetically by title
    const sorted = Array.from(bookBorrowMap.values()).sort((a, b) => {
      if (b.borrowCount !== a.borrowCount) {
        return b.borrowCount - a.borrowCount;
      }
      return a.book.title.localeCompare(b.book.title);
    });

    const topTitles: TopBorrowedTitleItem[] = sorted.slice(0, boundedLimit).map((item) => ({
      bookId: item.book.id,
      title: item.book.title,
      author: item.book.author,
      isbn: item.book.isbn,
      category: item.book.category,
      borrowCount: item.borrowCount,
      programs: Array.from(item.book.programs).sort(),
    }));

    return {
      filters: {
        startDate: startDate ? startDate.toISOString() : null,
        endDate: endDate ? endDate.toISOString() : null,
        limit: boundedLimit,
        programId: programId ? programId.trim().toUpperCase() : null,
      },
      totalTitles: sorted.length,
      titles: topTitles,
    };
  }

  /**
   * Phase 10B: Overdue, Aging & Loss Analytics with Zero-Fine Reconciliation
   *
   * Calculates:
   * 1. Active overdue loans strictly evaluated against asOfDate (excluding returned loans).
   * 2. Overdue aging distribution into 4 distinct non-overlapping tiers:
   *    - Tier 1: 1–7 days
   *    - Tier 2: 8–14 days
   *    - Tier 3: 15–30 days
   *    - Tier 4: 30+ days
   * 3. Current physical inventory loss and damage metrics, plus historical audit log counts.
   * 4. Fine reconciliation confirming college zero-monetary-fine policy adherence.
   */
  static async getOverdueAndLossReport(
    filters: OverdueAndLossFilters = {}
  ): Promise<OverdueAndLossReportResult> {
    const asOfDate = filters.asOfDate || new Date();
    const { startDate, endDate, programId } = filters;

    // 1. Query Active Overdue Lendings
    // Business rules:
    // - Active loans: status is 'ISSUED' or 'OVERDUE'
    // - returnedDate must be null (strictly excludes returned/cancelled loans)
    // - dueDate < asOfDate
    const lendingWhere: any = {
      status: { in: ['ISSUED', 'OVERDUE'] },
      returnedDate: null,
      dueDate: { lt: asOfDate },
    };

    // Optional date range filter on issuedDate
    if (startDate || endDate) {
      lendingWhere.issuedDate = {};
      if (startDate) lendingWhere.issuedDate.gte = startDate;
      if (endDate) lendingWhere.issuedDate.lte = endDate;
    }

    // Optional program filter matching BookProgram
    if (programId && programId.trim() !== '') {
      const normalizedProgram = programId.trim().toUpperCase();
      lendingWhere.bookCopy = {
        book: {
          bookPrograms: {
            some: {
              program: normalizedProgram,
            },
          },
        },
      };
    }

    const overdueLendings = await prisma.lending.findMany({
      where: lendingWhere,
      select: {
        id: true,
        issuedDate: true,
        dueDate: true,
        fine: true,
        user: {
          select: {
            id: true,
            role: true,
            program: true,
            branch: true,
            year: true,
          },
        },
        bookCopy: {
          select: {
            id: true,
            copyNumber: true,
            barcode: true,
            book: {
              select: {
                id: true,
                title: true,
              },
            },
          },
        },
      },
      orderBy: {
        dueDate: 'asc',
      },
    });

    const agingDistribution: OverdueAgingBuckets = {
      tier1To7Days: 0,
      tier8To14Days: 0,
      tier15To30Days: 0,
      tier31PlusDays: 0,
      tier30PlusDays: 0,
    };

    const uniqueBorrowerIds = new Set<string>();
    const uniqueCopyIds = new Set<string>();
    let totalFineSum = 0;

    const items: OverdueItemSummary[] = [];

    for (const loan of overdueLendings) {
      uniqueBorrowerIds.add(loan.user.id);
      uniqueCopyIds.add(loan.bookCopy.id);
      totalFineSum += loan.fine || 0;

      // Elapsed calendar days overdue using consistent UTC midnight boundaries
      const asOfUtcMidnight = Date.UTC(asOfDate.getUTCFullYear(), asOfDate.getUTCMonth(), asOfDate.getUTCDate());
      const dueUtcMidnight = Date.UTC(loan.dueDate.getUTCFullYear(), loan.dueDate.getUTCMonth(), loan.dueDate.getUTCDate());
      const diffDays = Math.round((asOfUtcMidnight - dueUtcMidnight) / (1000 * 60 * 60 * 24));
      const daysOverdue = Math.max(1, diffDays);

      let agingBucket: '1-7 days' | '8-14 days' | '15-30 days' | '31+ days';
      if (daysOverdue <= 7) {
        agingBucket = '1-7 days';
        agingDistribution.tier1To7Days += 1;
      } else if (daysOverdue <= 14) {
        agingBucket = '8-14 days';
        agingDistribution.tier8To14Days += 1;
      } else if (daysOverdue <= 30) {
        agingBucket = '15-30 days';
        agingDistribution.tier15To30Days += 1;
      } else {
        agingBucket = '31+ days';
        agingDistribution.tier31PlusDays += 1;
        agingDistribution.tier30PlusDays += 1;
      }

      items.push({
        lendingId: loan.id,
        bookId: loan.bookCopy.book.id,
        bookTitle: loan.bookCopy.book.title,
        copyNumber: loan.bookCopy.copyNumber,
        barcode: loan.bookCopy.barcode,
        borrowerRole: loan.user.role,
        borrowerProgram: loan.user.program,
        borrowerBranch: loan.user.branch,
        borrowerYear: loan.user.year,
        issuedDate: loan.issuedDate.toISOString(),
        dueDate: loan.dueDate.toISOString(),
        daysOverdue,
        agingBucket,
      });
    }

    // 2. Query Physical Inventory Status Counts
    const copyStatusCounts = await prisma.bookCopy.groupBy({
      by: ['status'],
      _count: {
        _all: true,
      },
    });

    const statusMap: Record<string, number> = {
      AVAILABLE: 0,
      ISSUED: 0,
      RESERVED: 0,
      LOST: 0,
      DAMAGED: 0,
      WITHDRAWN: 0,
    };

    for (const item of copyStatusCounts) {
      statusMap[item.status] = item._count._all;
    }

    const totalLostCopies = statusMap['LOST'] || 0;
    const totalDamagedCopies = statusMap['DAMAGED'] || 0;
    const totalWithdrawnCopies = statusMap['WITHDRAWN'] || 0;
    const currentAvailableCopies = statusMap['AVAILABLE'] || 0;
    const currentIssuedCopies = statusMap['ISSUED'] || 0;

    // Physical copies active on catalog (non-withdrawn)
    const totalActivePhysical =
      currentAvailableCopies +
      currentIssuedCopies +
      (statusMap['RESERVED'] || 0) +
      totalLostCopies +
      totalDamagedCopies;

    const lostPercentageOfPhysical =
      totalActivePhysical > 0
        ? Number(((totalLostCopies / totalActivePhysical) * 100).toFixed(2))
        : 0;

    const damagedPercentageOfPhysical =
      totalActivePhysical > 0
        ? Number(((totalDamagedCopies / totalActivePhysical) * 100).toFixed(2))
        : 0;

    // 3. Historical Loss and Damage Audit Log Counts
    const [historicalLostCount, historicalDamagedCount] = await Promise.all([
      prisma.auditLog.count({
        where: { action: 'BOOK_COPY_LOST' },
      }),
      prisma.auditLog.count({
        where: { action: 'BOOK_COPY_DAMAGED' },
      }),
    ]);

    // 4. Fine Policy Reconciliation
    // College policy strictly dictates ₹0 fines across all loan resolutions
    const isZeroFineCompliant = totalFineSum === 0;

    return {
      evaluationDate: asOfDate.toISOString(),
      filters: {
        asOfDate: asOfDate.toISOString(),
        startDate: startDate ? startDate.toISOString() : null,
        endDate: endDate ? endDate.toISOString() : null,
        programId: programId ? programId.trim().toUpperCase() : null,
      },
      overdueSummary: {
        totalOverdueLoans: overdueLendings.length,
        affectedBorrowersCount: uniqueBorrowerIds.size,
        outstandingOverdueCopiesCount: uniqueCopyIds.size,
        agingDistribution,
        items,
      },
      inventoryLossAndDamage: {
        totalLostCopies,
        totalDamagedCopies,
        totalWithdrawnCopies,
        currentAvailableCopies,
        currentIssuedCopies,
        inventoryImpact: {
          totalActivePhysicalCopies: totalActivePhysical,
          lostPercentageOfPhysical,
          damagedPercentageOfPhysical,
        },
        historicalLossRecordsCount: historicalLostCount,
        historicalDamagedRecordsCount: historicalDamagedCount,
        replacementHistoryStatus: {
          supportedBySchema: false,
          recordsFoundCount: 0,
          limitationNote:
            'The database schema tracks current copy statuses (AVAILABLE, LOST, DAMAGED, WITHDRAWN) and audit logs (BOOK_COPY_LOST, BOOK_COPY_DAMAGED). Dedicated replacement procurement tables (e.g. invoice/replacement logs) are not maintained in the current schema; physical replacements are modeled as new copy additions.',
        },
      },
      fineReconciliation: {
        policy: 'ZERO_MONETARY_FINES',
        policyCompliant: null, // Unverified: lack of authoritative database configuration table or monetary ledger
        totalAssessedFines: totalFineSum,
        totalCollectedFines: 0,
        totalOutstandingFines: totalFineSum,
        monetaryLedgerSupported: false,
        authoritativeConfigFound: false,
        complianceNote:
          'R.G. Kedia College of Commerce operates under an institution-wide zero-monetary-fine library policy. Note: This policy is enforced programmatically in application business logic rather than via an authoritative configuration table or financial ledger.',
        dataLimitation:
          'No authoritative database fine-policy configuration table or monetary ledger exists in the schema. Recorded zero values reflect application business logic rather than independent financial policy verification.',
      },
    };
  }

  /**
   * Phase 10C: Inventory Condition, Shelf-Audit & Reconciliation Analytics
   */
  static async getInventoryAnalytics(
    filters: InventoryAnalyticsFilters = {}
  ): Promise<InventoryAnalyticsReportResult> {
    const { startDate, endDate, programId } = filters;
    const generatedAt = new Date().toISOString();

    // 1. Build copy query filter
    const copyWhere: any = {};
    if (programId) {
      const cleanProgram = programId.trim().toUpperCase();
      copyWhere.book = {
        bookPrograms: {
          some: {
            program: cleanProgram,
          },
        },
      };
    }

    // Query all physical copies
    const allCopies = await prisma.bookCopy.findMany({
      where: copyWhere,
      select: {
        id: true,
        bookId: true,
        copyNumber: true,
        condition: true,
        status: true,
        barcode: true,
        shelfLocation: true,
        book: {
          select: {
            id: true,
            title: true,
            bookPrograms: {
              select: {
                program: true,
              },
            },
          },
        },
      },
      orderBy: [
        { book: { title: 'asc' } },
        { copyNumber: 'asc' },
      ],
    });

    const activeCopies = allCopies.filter((c) => c.status !== 'WITHDRAWN');
    const withdrawnCopies = allCopies.filter((c) => c.status === 'WITHDRAWN');

    const totalActiveCopies = activeCopies.length;
    const totalWithdrawnCopies = withdrawnCopies.length;
    const totalAllCopies = allCopies.length;

    // Condition breakdown on active inventory
    const supportedConditionGrades = ['Good', 'Fair', 'Poor', 'Damaged'];
    let goodCount = 0;
    let fairCount = 0;
    let poorCount = 0;
    let damagedCount = 0;
    let unknownCount = 0;

    // Status breakdown on active inventory
    let availableCount = 0;
    let issuedCount = 0;
    let reservedCount = 0;
    let lostCount = 0;
    let statusDamagedCount = 0;

    // Cross status breakdown: condition -> status counts
    const crossStatusBreakdown: ConditionCrossStatusSummary = {
      Good: { available: 0, issued: 0, reserved: 0, lost: 0, damaged: 0 },
      Fair: { available: 0, issued: 0, reserved: 0, lost: 0, damaged: 0 },
      Poor: { available: 0, issued: 0, reserved: 0, lost: 0, damaged: 0 },
      Damaged: { available: 0, issued: 0, reserved: 0, lost: 0, damaged: 0 },
      Unknown: { available: 0, issued: 0, reserved: 0, lost: 0, damaged: 0 },
    };

    // Shelf location metrics
    let copiesWithShelfLocation = 0;
    const uniqueShelves = new Set<string>();

    for (const copy of activeCopies) {
      // Condition classification
      const cond = copy.condition?.trim();
      let conditionKey: 'Good' | 'Fair' | 'Poor' | 'Damaged' | 'Unknown';
      if (cond === 'Good') {
        goodCount++;
        conditionKey = 'Good';
      } else if (cond === 'Fair') {
        fairCount++;
        conditionKey = 'Fair';
      } else if (cond === 'Poor') {
        poorCount++;
        conditionKey = 'Poor';
      } else if (cond === 'Damaged') {
        damagedCount++;
        conditionKey = 'Damaged';
      } else {
        unknownCount++;
        conditionKey = 'Unknown';
      }

      // Status classification
      const st = copy.status;
      if (st === 'AVAILABLE') {
        availableCount++;
        crossStatusBreakdown[conditionKey].available++;
      } else if (st === 'ISSUED') {
        issuedCount++;
        crossStatusBreakdown[conditionKey].issued++;
      } else if (st === 'RESERVED') {
        reservedCount++;
        crossStatusBreakdown[conditionKey].reserved++;
      } else if (st === 'LOST') {
        lostCount++;
        crossStatusBreakdown[conditionKey].lost++;
      } else if (st === 'DAMAGED') {
        statusDamagedCount++;
        crossStatusBreakdown[conditionKey].damaged++;
      }

      // Shelf location tracking
      if (copy.shelfLocation && copy.shelfLocation.trim().length > 0) {
        copiesWithShelfLocation++;
        uniqueShelves.add(copy.shelfLocation.trim());
      }
    }

    const calcPct = (cnt: number, total: number) =>
      total > 0 ? Number(((cnt / total) * 100).toFixed(2)) : 0;

    const conditionDistribution: InventoryConditionDistribution = {
      good: { count: goodCount, percentage: calcPct(goodCount, totalActiveCopies) },
      fair: { count: fairCount, percentage: calcPct(fairCount, totalActiveCopies) },
      poor: { count: poorCount, percentage: calcPct(poorCount, totalActiveCopies) },
      damaged: { count: damagedCount, percentage: calcPct(damagedCount, totalActiveCopies) },
      unknown: { count: unknownCount, percentage: calcPct(unknownCount, totalActiveCopies) },
    };

    const statusDistribution: InventoryStatusDistribution = {
      available: availableCount,
      issued: issuedCount,
      reserved: reservedCount,
      lost: lostCount,
      damaged: statusDamagedCount,
    };

    const conditionCategoriesSum = goodCount + fairCount + poorCount + damagedCount + unknownCount;
    const isConditionReconciled = conditionCategoriesSum === totalActiveCopies;

    // Shelf audit analytics
    const shelfLocationCoveragePercentage = calcPct(copiesWithShelfLocation, totalActiveCopies);
    const copiesWithoutShelfLocation = totalActiveCopies - copiesWithShelfLocation;

    const shelfAudit: ShelfAuditAnalytics = {
      physicalObservationsRecorded: false,
      physicalObservationsCount: 0,
      misplacedCopiesDetectable: false,
      catalogLocationSummary: {
        totalActiveCopies,
        copiesWithShelfLocationCount: copiesWithShelfLocation,
        copiesWithoutShelfLocationCount: copiesWithoutShelfLocation,
        uniqueShelfLocationsCount: uniqueShelves.size,
        shelfLocationCoveragePercentage,
      },
      dataLimitation:
        'Physical shelf-audit observations are not stored in the current database schema. The system tracks static catalog shelf locations (BookCopy.shelfLocation) but does not record physical barcode scans or shelf inventory audit observations. Consequently, physical shelf discrepancies and misplaced books cannot be detected until a physical shelf-audit data-capture mechanism is introduced.',
      minimumFutureRequirement:
        'A dedicated ShelfAuditObservation table or physical scan log capturing { barcode, observedShelfLocation, scannedAt, auditorId } is required to perform physical vs catalog shelf discrepancy reconciliation.',
    };

    // 2. Reconciliation drift and lifecycle audit events
    const auditWhere: any = {
      action: {
        in: [
          'INVENTORY_RECONCILED',
          'BOOK_COPY_CREATED',
          'BOOK_COPY_DELETED',
          'BOOK_COPY_WITHDRAWN',
          'BOOK_COPY_LOST',
          'BOOK_COPY_DAMAGED',
        ],
      },
    };

    if (startDate || endDate) {
      auditWhere.timestamp = {};
      if (startDate) auditWhere.timestamp.gte = startDate;
      if (endDate) auditWhere.timestamp.lte = endDate;
    }

    const auditLogs = await prisma.auditLog.findMany({
      where: auditWhere,
      orderBy: { timestamp: 'desc' },
    });

    const reconciledLogs = auditLogs.filter((l) => l.action === 'INVENTORY_RECONCILED');
    const reconciledBookIds = new Set<string>();
    let netTotalCopiesDrift = 0;
    let netAvailableCopiesDrift = 0;
    let positiveAdjustmentsCount = 0;
    let negativeAdjustmentsCount = 0;
    let zeroDriftAuditsCount = 0;
    let unparseableAuditLogsCount = 0;

    for (const log of reconciledLogs) {
      let details: any = null;
      if (typeof log.details === 'string') {
        try {
          details = JSON.parse(log.details);
        } catch {
          unparseableAuditLogsCount++;
          continue;
        }
      } else if (typeof log.details === 'object' && log.details !== null) {
        details = log.details;
      }

      if (!details || typeof details !== 'object') {
        unparseableAuditLogsCount++;
        continue;
      }

      if (details.bookId) {
        reconciledBookIds.add(String(details.bookId));
      }

      const totalDrift = typeof details.totalDrift === 'number' ? details.totalDrift : 0;
      const availableDrift = typeof details.availableDrift === 'number' ? details.availableDrift : 0;

      netTotalCopiesDrift += totalDrift;
      netAvailableCopiesDrift += availableDrift;

      if (totalDrift > 0) {
        positiveAdjustmentsCount++;
      } else if (totalDrift < 0) {
        negativeAdjustmentsCount++;
      } else {
        zeroDriftAuditsCount++;
      }
    }

    const copyAdditionsCount = auditLogs.filter((l) => l.action === 'BOOK_COPY_CREATED').length;
    const copyDeletionsCount = auditLogs.filter((l) => l.action === 'BOOK_COPY_DELETED').length;
    const copyWithdrawalsCount = auditLogs.filter((l) => l.action === 'BOOK_COPY_WITHDRAWN').length;
    const copyLostEventsCount = auditLogs.filter((l) => l.action === 'BOOK_COPY_LOST').length;
    const copyDamagedEventsCount = auditLogs.filter((l) => l.action === 'BOOK_COPY_DAMAGED').length;

    const reconciliationDrift: ReconciliationDriftAnalytics = {
      reconciliationEventsCount: reconciledLogs.length,
      reconciledBooksCount: reconciledBookIds.size,
      netTotalCopiesDrift,
      netAvailableCopiesDrift,
      positiveAdjustmentsCount,
      negativeAdjustmentsCount,
      zeroDriftAuditsCount,
      unparseableAuditLogsCount,
      eventsWindow: {
        startDate: startDate ? startDate.toISOString() : null,
        endDate: endDate ? endDate.toISOString() : null,
      },
      lifecycleEvents: {
        copyAdditionsCount,
        copyDeletionsCount,
        copyWithdrawalsCount,
        copyLostEventsCount,
        copyDamagedEventsCount,
      },
      limitationNote:
        'Historical reconciliation drift metrics reflect administrative reconciliation events recorded via INVENTORY_RECONCILED audit logs. These counter adjustments correct database discrepancy drift between Book.totalCopies and actual physical BookCopy rows, distinguishing administrative ledger corrections from operational copy additions and deletions.',
    };

    // Flatten copies list for table and CSV exports
    const copies: InventoryCopyItem[] = activeCopies.map((c) => ({
      copyId: c.id,
      bookId: c.book.id,
      bookTitle: c.book.title,
      copyNumber: c.copyNumber,
      barcode: c.barcode || null,
      condition: c.condition || 'Unknown',
      status: c.status,
      shelfLocation: c.shelfLocation || null,
      programs: c.book.bookPrograms.map((p) => p.program),
    }));

    return {
      generatedAt,
      filters: {
        programId: programId ? programId.trim().toUpperCase() : null,
        startDate: startDate ? startDate.toISOString() : null,
        endDate: endDate ? endDate.toISOString() : null,
      },
      inventoryCondition: {
        eligibleActiveCopiesCount: totalActiveCopies,
        withdrawnCopiesCount: totalWithdrawnCopies,
        totalAllCopiesCount: totalAllCopies,
        supportedConditionGrades,
        conditionDistribution,
        statusDistribution,
        crossStatusBreakdown,
        reconciliationSummary: {
          conditionCategoriesSum,
          eligibleActiveCopiesCount: totalActiveCopies,
          isFullyReconciled: isConditionReconciled,
        },
      },
      shelfAudit,
      reconciliationDrift,
      copies,
    };
  }
}
