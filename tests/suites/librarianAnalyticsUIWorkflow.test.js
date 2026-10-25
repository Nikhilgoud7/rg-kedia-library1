// tests/suites/librarianAnalyticsUIWorkflow.test.js — Phase 10D Librarian Analytics Dashboard & Workflow Test Suite
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createApiClient, findLeakedSecrets } from '../helpers/apiClient.js';
import { TestDataManager } from '../helpers/testData.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

export async function runLibrarianAnalyticsUIWorkflowTests(baseUrl, assert) {
  const dataManager = new TestDataManager();
  const prisma = dataManager.prisma;

  try {
    // =========================================================================
    // SECTION 1: Personas & RBAC Route Protection (Req 1, 2)
    // =========================================================================
    const librarian = await dataManager.createLibrarian({ tag: 'p10d_lib' });
    const librarianClient = createApiClient(baseUrl);
    librarianClient.loginAs(librarian);

    const teacher = await dataManager.createTeacher({ tag: 'p10d_tch' });
    const teacherClient = createApiClient(baseUrl);
    teacherClient.loginAs(teacher);

    const student = await dataManager.createStudent({ tag: 'p10d_stu' });
    const studentClient = createApiClient(baseUrl);
    studentClient.loginAs(student);

    const unauthClient = createApiClient(baseUrl);

    // 1.1 Unauthenticated requests are rejected across all analytics endpoints
    const unauthCirc = await unauthClient.request('GET', '/api/reports/circulation-summary?startDate=2026-01-01&endDate=2026-01-31');
    assert(unauthCirc.status === 401, 'Unauthenticated request to circulation-summary rejected (HTTP 401)');

    const unauthTop = await unauthClient.request('GET', '/api/reports/top-borrowed');
    assert(unauthTop.status === 401, 'Unauthenticated request to top-borrowed rejected (HTTP 401)');

    const unauthOverdue = await unauthClient.request('GET', '/api/reports/overdue-loss');
    assert(unauthOverdue.status === 401, 'Unauthenticated request to overdue-loss rejected (HTTP 401)');

    const unauthInv = await unauthClient.request('GET', '/api/reports/inventory-analytics');
    assert(unauthInv.status === 401, 'Unauthenticated request to inventory-analytics rejected (HTTP 401)');

    // 1.2 Student persona is blocked from all analytics endpoints
    const stuCirc = await studentClient.request('GET', '/api/reports/circulation-summary?startDate=2026-01-01&endDate=2026-01-31');
    assert(stuCirc.status === 403, 'Student persona blocked from circulation-summary (HTTP 403)');

    const stuTop = await studentClient.request('GET', '/api/reports/top-borrowed');
    assert(stuTop.status === 403, 'Student persona blocked from top-borrowed (HTTP 403)');

    const stuOverdue = await studentClient.request('GET', '/api/reports/overdue-loss');
    assert(stuOverdue.status === 403, 'Student persona blocked from overdue-loss (HTTP 403)');

    const stuInv = await studentClient.request('GET', '/api/reports/inventory-analytics');
    assert(stuInv.status === 403, 'Student persona blocked from inventory-analytics (HTTP 403)');

    // 1.3 Faculty/Teacher persona is blocked from all analytics endpoints
    const tchCirc = await teacherClient.request('GET', '/api/reports/circulation-summary?startDate=2026-01-01&endDate=2026-01-31');
    assert(tchCirc.status === 403, 'Faculty persona blocked from circulation-summary (HTTP 403)');

    const tchTop = await teacherClient.request('GET', '/api/reports/top-borrowed');
    assert(tchTop.status === 403, 'Faculty persona blocked from top-borrowed (HTTP 403)');

    const tchOverdue = await teacherClient.request('GET', '/api/reports/overdue-loss');
    assert(tchOverdue.status === 403, 'Faculty persona blocked from overdue-loss (HTTP 403)');

    const tchInv = await teacherClient.request('GET', '/api/reports/inventory-analytics');
    assert(tchInv.status === 403, 'Faculty persona blocked from inventory-analytics (HTTP 403)');

    // 1.4 Librarian persona has authorized access across all endpoints
    const libCirc = await librarianClient.request('GET', '/api/reports/circulation-summary?startDate=2026-01-01&endDate=2026-01-31');
    assert(libCirc.status === 200, 'Librarian can access circulation-summary (HTTP 200)');

    const libTop = await librarianClient.request('GET', '/api/reports/top-borrowed');
    assert(libTop.status === 200, 'Librarian can access top-borrowed (HTTP 200)');

    const libOverdue = await librarianClient.request('GET', '/api/reports/overdue-loss');
    assert(libOverdue.status === 200, 'Librarian can access overdue-loss (HTTP 200)');

    const libInv = await librarianClient.request('GET', '/api/reports/inventory-analytics');
    assert(libInv.status === 200, 'Librarian can access inventory-analytics (HTTP 200)');

    // =========================================================================
    // SECTION 2: Circulation Summary Tab Contract & Filtering (Req 3, 4)
    // =========================================================================
    // 2.1 Daily, Weekly, Monthly period query parameters
    const dailyRes = await librarianClient.request('GET', '/api/reports/circulation-summary?startDate=2026-01-01&endDate=2026-01-07&period=DAILY');
    const dailyData = dailyRes.body;
    assert(dailyData.success === true, 'DAILY circulation summary returns success: true');
    assert(dailyData.data.period === 'DAILY', 'Confirms DAILY period in response');
    assert(typeof dailyData.data.totals.totalIssued === 'number', 'Reports numeric totalIssued');
    assert(typeof dailyData.data.totals.totalReturned === 'number', 'Reports numeric totalReturned');
    assert(typeof dailyData.data.totals.totalRenewals === 'number', 'Reports numeric totalRenewals');
    assert(typeof dailyData.data.totals.netCirculation === 'number', 'Reports numeric netCirculation');
    assert(Array.isArray(dailyData.data.breakdown), 'Reports breakdown as an array');

    const weeklyRes = await librarianClient.request('GET', '/api/reports/circulation-summary?startDate=2026-01-01&endDate=2026-01-31&period=WEEKLY');
    const weeklyData = weeklyRes.body;
    assert(weeklyData.data.period === 'WEEKLY', 'Confirms WEEKLY period in response');

    const monthlyRes = await librarianClient.request('GET', '/api/reports/circulation-summary?startDate=2026-01-01&endDate=2026-03-31&period=MONTHLY');
    const monthlyData = monthlyRes.body;
    assert(monthlyData.data.period === 'MONTHLY', 'Confirms MONTHLY period in response');

    // 2.2 Circulation CSV export
    const circCsvRes = await librarianClient.request('GET', '/api/reports/circulation-summary?startDate=2026-01-01&endDate=2026-01-07&period=DAILY&format=csv');
    assert(circCsvRes.status === 200, 'Circulation summary CSV export returns HTTP 200');
    assert(circCsvRes.headers.get('content-type')?.includes('text/csv'), 'Circulation CSV has text/csv Content-Type');
    const circCsvText = typeof circCsvRes.data === 'string' ? circCsvRes.data : '';
    assert(circCsvText.includes('Issued Loans') && circCsvText.includes('Net Circulation'), 'Circulation CSV contains header columns');
    assert(circCsvRes.headers.get('content-disposition')?.includes('circulation-summary-daily.csv'), 'Circulation CSV has appropriate Content-Disposition');

    // =========================================================================
    // SECTION 3: Top Borrowed Titles Tab Contract & Filtering (Req 3, 4)
    // =========================================================================
    // 3.1 Limit and program filtering
    const topLimitRes = await librarianClient.request('GET', '/api/reports/top-borrowed?limit=5');
    const topLimitData = topLimitRes.body;
    assert(topLimitData.success === true, 'Top borrowed titles returns success: true');
    assert(topLimitData.data.titles.length <= 5, 'Respects limit=5 parameter');
    assert(typeof topLimitData.data.totalTitles === 'number', 'Reports totalTitles metric');

    const topProgRes = await librarianClient.request('GET', '/api/reports/top-borrowed?programId=BBA');
    const topProgData = topProgRes.body;
    assert(topProgData.success === true, 'Program-filtered top borrowed returns HTTP 200');
    assert(topProgData.data.filters.programId === 'BBA', 'Reflects programId in filters metadata');

    // 3.2 Top Borrowed CSV export
    const topCsvRes = await librarianClient.request('GET', '/api/reports/top-borrowed?limit=10&format=csv');
    assert(topCsvRes.status === 200, 'Top borrowed CSV export returns HTTP 200');
    assert(topCsvRes.headers.get('content-type')?.includes('text/csv'), 'Top borrowed CSV has text/csv Content-Type');
    const topCsvText = typeof topCsvRes.data === 'string' ? topCsvRes.data : '';
    assert(topCsvText.includes('Book Title') && topCsvText.includes('Total Borrows'), 'Top borrowed CSV contains header columns');

    // =========================================================================
    // SECTION 4: Overdue & Aging Analytics Contract & Honest Fine Policy (Req 7, 8)
    // =========================================================================
    const overdueRes = await librarianClient.request('GET', '/api/reports/overdue-loss');
    const overdueData = overdueRes.body;
    assert(overdueData.success === true, 'Overdue and loss report returns success: true');

    const overdueSum = overdueData.data.overdueSummary;
    const aging = overdueSum.agingDistribution;
    assert(typeof aging.tier1To7Days === 'number', 'Aging distribution includes tier1To7Days');
    assert(typeof aging.tier8To14Days === 'number', 'Aging distribution includes tier8To14Days');
    assert(typeof aging.tier15To30Days === 'number', 'Aging distribution includes tier15To30Days');
    assert(typeof aging.tier31PlusDays === 'number', 'Aging distribution includes tier31PlusDays');
    assert(
      aging.tier1To7Days + aging.tier8To14Days + aging.tier15To30Days + aging.tier31PlusDays === overdueSum.totalOverdueLoans,
      'Aging buckets strictly sum to totalOverdueLoans (no orphan loans)'
    );

    // 4.2 Fine Policy Honest Disclosure (Crucial Requirement)
    const fineRec = overdueData.data.fineReconciliation;
    assert(fineRec.policy === 'ZERO_MONETARY_FINES', 'Reports ZERO_MONETARY_FINES policy');
    assert(
      fineRec.policyCompliant === null,
      'policyCompliant is strictly null (unverified due to missing authoritative database config)'
    );
    assert(fineRec.authoritativeConfigFound === false, 'authoritativeConfigFound is strictly false');
    assert(fineRec.totalAssessedFines === 0, 'Total assessed fines is reported as ₹0');
    assert(fineRec.totalCollectedFines === 0, 'Total collected fines is reported as ₹0');
    assert(fineRec.totalOutstandingFines === 0, 'Total outstanding fines is reported as ₹0');
    assert(typeof fineRec.dataLimitation === 'string' && fineRec.dataLimitation.length > 20, 'Includes descriptive dataLimitation note');

    // 4.3 Inventory impact distinction
    const invLoss = overdueData.data.inventoryLossAndDamage;
    assert(typeof invLoss.totalLostCopies === 'number', 'Tracks current lost copies');
    assert(typeof invLoss.totalDamagedCopies === 'number', 'Tracks current damaged copies');
    assert(typeof invLoss.historicalLossRecordsCount === 'number', 'Tracks historical loss audit logs');
    assert(typeof invLoss.historicalDamagedRecordsCount === 'number', 'Tracks historical damage audit logs');
    assert(invLoss.replacementHistoryStatus.supportedBySchema === false, 'Truthfully reports replacement tables unsupported');

    // 4.4 Overdue CSV export
    const overdueCsvRes = await librarianClient.request('GET', '/api/reports/overdue-loss?format=csv');
    assert(overdueCsvRes.status === 200, 'Overdue CSV export returns HTTP 200');
    assert(overdueCsvRes.headers.get('content-type')?.includes('text/csv'), 'Overdue CSV has text/csv Content-Type');
    const overdueCsvText = typeof overdueCsvRes.data === 'string' ? overdueCsvRes.data : '';
    assert(overdueCsvText.includes('Aging Bucket') && overdueCsvText.includes('Days Overdue'), 'Overdue CSV contains header columns');

    // =========================================================================
    // SECTION 5: Inventory Condition & Shelf Coverage Contract (Req 9, 10)
    // =========================================================================
    const invRes = await librarianClient.request('GET', '/api/reports/inventory-analytics');
    const invData = invRes.body;
    assert(invData.success === true, 'Inventory analytics returns success: true');

    const invCond = invData.data.inventoryCondition;
    assert(typeof invCond.eligibleActiveCopiesCount === 'number', 'Reports eligibleActiveCopiesCount');
    assert(typeof invCond.withdrawnCopiesCount === 'number', 'Reports withdrawnCopiesCount');
    assert(
      invCond.totalAllCopiesCount === invCond.eligibleActiveCopiesCount + invCond.withdrawnCopiesCount,
      'Total copies strictly equals active copies plus withdrawn copies'
    );
    assert(invCond.reconciliationSummary.isFullyReconciled === true, 'Condition categories reconcile 100%');

    // 5.2 Shelf Audit Honest Limitation Disclosure
    const shelf = invData.data.shelfAudit;
    assert(shelf.physicalObservationsRecorded === false, 'physicalObservationsRecorded is strictly false');
    assert(shelf.physicalObservationsCount === 0, 'physicalObservationsCount is strictly 0');
    assert(shelf.misplacedCopiesDetectable === false, 'misplacedCopiesDetectable is strictly false');
    assert(typeof shelf.dataLimitation === 'string' && shelf.dataLimitation.length > 20, 'Includes explicit shelf-audit limitation note');
    const catalogLocation = shelf.catalogLocationSummary || shelf.catalogShelfLocationCoverage;
    assert(typeof catalogLocation?.shelfLocationCoveragePercentage === 'number', 'Reports static shelf location coverage percentage');

    // 5.3 Inventory CSV export
    const invCsvRes = await librarianClient.request('GET', '/api/reports/inventory-analytics?format=csv');
    assert(invCsvRes.status === 200, 'Inventory analytics CSV export returns HTTP 200');
    assert(invCsvRes.headers.get('content-type')?.includes('text/csv'), 'Inventory CSV has text/csv Content-Type');
    const invCsvText = typeof invCsvRes.data === 'string' ? invCsvRes.data : '';
    assert(invCsvText.includes('Shelf Location') && invCsvText.includes('Condition'), 'Inventory CSV contains header columns');

    // =========================================================================
    // SECTION 6: Frontend Source Tree & Architecture Verification (Req 1, 5, 6, 12)
    // =========================================================================
    // 6.1 Verify existence of core Phase 10D frontend files
    const dashboardPagePath = path.join(projectRoot, 'client/src/pages/librarian/AnalyticsDashboard.tsx');
    assert(fs.existsSync(dashboardPagePath), 'AnalyticsDashboard.tsx exists in client/src/pages/librarian/');

    const circulationTabPath = path.join(projectRoot, 'client/src/components/librarian/analytics/CirculationSummaryTab.tsx');
    assert(fs.existsSync(circulationTabPath), 'CirculationSummaryTab.tsx exists');

    const topBorrowedTabPath = path.join(projectRoot, 'client/src/components/librarian/analytics/TopBorrowedTitlesTab.tsx');
    assert(fs.existsSync(topBorrowedTabPath), 'TopBorrowedTitlesTab.tsx exists');

    const overdueAgingTabPath = path.join(projectRoot, 'client/src/components/librarian/analytics/OverdueAgingTab.tsx');
    assert(fs.existsSync(overdueAgingTabPath), 'OverdueAgingTab.tsx exists');

    const inventoryConditionTabPath = path.join(projectRoot, 'client/src/components/librarian/analytics/InventoryConditionTab.tsx');
    assert(fs.existsSync(inventoryConditionTabPath), 'InventoryConditionTab.tsx exists');

    const dateFilterPath = path.join(projectRoot, 'client/src/components/librarian/analytics/AnalyticsDateFilter.tsx');
    assert(fs.existsSync(dateFilterPath), 'AnalyticsDateFilter.tsx exists');

    const csvButtonPath = path.join(projectRoot, 'client/src/components/librarian/analytics/CsvExportButton.tsx');
    assert(fs.existsSync(csvButtonPath), 'CsvExportButton.tsx exists');

    const reportsTypePath = path.join(projectRoot, 'client/src/types/reports.ts');
    assert(fs.existsSync(reportsTypePath), 'reports.ts exists in client/src/types/');

    // 6.2 Verify App.tsx route registration
    const appTsxContent = fs.readFileSync(path.join(projectRoot, 'client/src/App.tsx'), 'utf8');
    assert(appTsxContent.includes('/librarian/analytics'), 'App.tsx registers /librarian/analytics route');
    assert(appTsxContent.includes('AnalyticsDashboard'), 'App.tsx imports AnalyticsDashboard');
    assert(appTsxContent.includes("allowedRoles={['LIBRARIAN']}"), 'Analytics route is guarded with LIBRARIAN role');

    // 6.3 Verify Sidebar.tsx navigation entry
    const sidebarContent = fs.readFileSync(path.join(projectRoot, 'client/src/components/common/Sidebar.tsx'), 'utf8');
    assert(sidebarContent.includes('/librarian/analytics'), 'Sidebar.tsx has navigation link to /librarian/analytics');
    assert(sidebarContent.includes('Reports & Analytics'), 'Sidebar.tsx displays Reports & Analytics label');

    // 6.4 Verify zero extraneous charting dependencies in client/package.json
    const clientPkgContent = fs.readFileSync(path.join(projectRoot, 'client/package.json'), 'utf8');
    const clientPkg = JSON.parse(clientPkgContent);
    assert(!clientPkg.dependencies['recharts'], 'client does not introduce unneeded recharts dependency');
    assert(!clientPkg.dependencies['chart.js'], 'client does not introduce unneeded chart.js dependency');

    // 6.5 Verify PII minimization in API payloads
    const leakedSecrets = findLeakedSecrets(overdueData.data);
    assert(leakedSecrets.length === 0, 'No secrets or sensitive tokens leaked in overdue payload');

    const overdueItems = overdueData.data.overdueSummary.items;
    for (const item of overdueItems) {
      assert(item.password === undefined, 'Overdue item has no password field');
      assert(item.tokenVersion === undefined, 'Overdue item has no tokenVersion field');
      assert(item.borrowerEmail === undefined, 'Overdue item has no borrowerEmail field');
      assert(item.borrowerPhone === undefined, 'Overdue item has no borrowerPhone field');
    }
  } finally {
    await dataManager.cleanup();
  }
}
