// client/src/types/reports.ts — Reporting & Analytics Data Models for RG-Kedia LMS

export type PeriodType = 'DAILY' | 'WEEKLY' | 'MONTHLY';
export type ReportProgram = 'BCOM' | 'BBA' | 'BSC';

// =============================================================================
// Circulation Summary Types (Phase 10A)
// =============================================================================

export interface CirculationTotals {
  totalIssued: number;
  totalReturned: number;
  totalRenewals: number;
  netCirculation: number;
}

export interface CirculationBucket {
  period: string; // YYYY-MM-DD or YYYY-Www or YYYY-MM
  issuedCount: number;
  returnedCount: number;
  renewalCount: number;
  netCirculation: number;
}

export interface CirculationSummaryData {
  startDate: string;
  endDate: string;
  period: PeriodType;
  totals: CirculationTotals;
  breakdown: CirculationBucket[];
}

export interface CirculationSummaryResponse {
  success: boolean;
  data: CirculationSummaryData;
}

// =============================================================================
// Top Borrowed Titles Types (Phase 10A)
// =============================================================================

export interface TopBorrowedTitle {
  bookId: string;
  title: string;
  author: string;
  isbn?: string | null;
  category: string;
  coverImage?: string | null;
  borrowCount: number;
  programs: string[];
}

export interface TopBorrowedData {
  filters: {
    startDate?: string | null;
    endDate?: string | null;
    limit: number;
    programId?: string | null;
  };
  totalTitles: number;
  titles: TopBorrowedTitle[];
}

export interface TopBorrowedResponse {
  success: boolean;
  data: TopBorrowedData;
}

// =============================================================================
// Overdue, Aging & Loss Types (Phase 10B)
// =============================================================================

export interface AgingDistribution {
  tier1To7Days: number;
  tier8To14Days: number;
  tier15To30Days: number;
  tier31PlusDays: number;
  tier30PlusDays?: number; // Backward-compatible alias
}

export interface OverdueLoanItem {
  lendingId: string;
  bookId: string;
  bookTitle: string;
  copyId: string;
  copyNumber: number;
  barcode: string;
  borrowerId: string;
  borrowerRole: string;
  borrowerName: string;
  borrowerRollNumber: string;
  borrowerProgram: string;
  borrowerBranch: string;
  borrowerYear: number;
  issuedDate: string;
  dueDate: string;
  daysOverdue: number;
  agingBucket: string;
}

export interface InventoryLossAndDamage {
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

export interface OverdueAndLossData {
  evaluationDate: string;
  filters: {
    asOfDate: string;
    startDate?: string | null;
    endDate?: string | null;
    programId?: string | null;
  };
  overdueSummary: {
    totalOverdueLoans: number;
    affectedBorrowersCount: number;
    outstandingOverdueCopiesCount: number;
    agingDistribution: AgingDistribution;
    items: OverdueLoanItem[];
  };
  inventoryLossAndDamage: InventoryLossAndDamage;
  fineReconciliation: FineReconciliationSummary;
}

export interface OverdueAndLossResponse {
  success: boolean;
  data: OverdueAndLossData;
}

// =============================================================================
// Inventory Condition, Shelf-Audit & Reconciliation Types (Phase 10C)
// =============================================================================

export interface ConditionCategoryMetric {
  count: number;
  percentage: number;
}

export interface ConditionDistribution {
  good: ConditionCategoryMetric;
  fair: ConditionCategoryMetric;
  poor: ConditionCategoryMetric;
  damaged: ConditionCategoryMetric;
  unknown: ConditionCategoryMetric;
}

export interface ConditionReconciliationSummary {
  sumOfConditionCategories: number;
  eligibleActiveCopiesCount: number;
  isFullyReconciled: boolean;
}

export interface StatusDistribution {
  available: number;
  issued: number;
  reserved: number;
  lost: number;
  damaged: number;
}

export interface InventoryConditionReport {
  eligibleActiveCopiesCount: number;
  withdrawnCopiesCount: number;
  totalAllCopiesCount: number;
  supportedConditionGrades: string[];
  distribution: ConditionDistribution;
  reconciliationSummary: ConditionReconciliationSummary;
  crossStatusBreakdown: Record<string, Record<string, number>>;
  statusDistribution: StatusDistribution;
}

export interface CatalogShelfLocationCoverage {
  totalActiveCopies: number;
  copiesWithShelfLocationCount: number;
  copiesWithoutShelfLocationCount: number;
  uniqueShelfLocationsCount?: number;
  distinctShelfLocationsCount?: number;
  shelfLocationCoveragePercentage: number;
}

export interface ShelfAuditReport {
  physicalObservationsRecorded: boolean;
  physicalObservationsCount: number;
  misplacedCopiesDetectable: boolean;
  dataLimitation: string;
  minimumFutureRequirement: string;
  catalogLocationSummary?: CatalogShelfLocationCoverage;
  catalogShelfLocationCoverage?: CatalogShelfLocationCoverage;
}

export interface LifecycleEventsSummary {
  copyAdditionsCount: number;
  copyDeletionsCount: number;
  copyWithdrawalsCount: number;
  copyLostEventsCount: number;
  copyDamagedEventsCount: number;
}

export interface ReconciliationDriftReport {
  reconciliationEventsCount: number;
  reconciledBooksCount: number;
  netTotalCopiesDrift: number;
  netAvailableCopiesDrift: number;
  positiveAdjustmentsCount: number;
  negativeAdjustmentsCount: number;
  zeroDriftAuditsCount: number;
  lifecycleEvents: LifecycleEventsSummary;
  limitationNote: string;
}

export interface InventoryAnalyticsCopyItem {
  copyId: string;
  bookId: string;
  bookTitle: string;
  copyNumber: number;
  barcode: string;
  condition: string;
  status: string;
  shelfLocation: string;
  programs: string[];
}

export interface InventoryAnalyticsData {
  generatedAt: string;
  filters: {
    startDate?: string | null;
    endDate?: string | null;
    programId?: string | null;
  };
  inventoryCondition: InventoryConditionReport;
  shelfAudit: ShelfAuditReport;
  reconciliationDrift: ReconciliationDriftReport;
  copies: InventoryAnalyticsCopyItem[];
}

export interface InventoryAnalyticsResponse {
  success: boolean;
  data: InventoryAnalyticsData;
}
