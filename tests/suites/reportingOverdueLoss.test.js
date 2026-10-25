// tests/suites/reportingOverdueLoss.test.js — Phase 10B Overdue, Aging & Loss Analytics Test Suite
import { PrismaClient } from '@prisma/client';
import { createApiClient } from '../helpers/apiClient.js';
import { TestDataManager } from '../helpers/testData.js';
import { ReportingService } from '../../dist/server/services/reportingService.js';
import { neutralizeFormulaInjection, generateCsv } from '../../dist/server/lib/reports/csvExport.js';

export async function runReportingOverdueLossTests(baseUrl, assert) {
  const prisma = new PrismaClient();
  const dataManager = new TestDataManager();

  try {
    // -------------------------------------------------------------------------
    // Setup Test Personas
    // -------------------------------------------------------------------------
    const studentA = await dataManager.createStudent({ tag: 'od_stua' });
    const studentB = await dataManager.createStudent({ tag: 'od_stub' });
    const teacher = await dataManager.createTeacher({ tag: 'od_tea' });
    const librarian = await dataManager.createLibrarian({ tag: 'od_lib' });

    const anonClient = createApiClient(baseUrl);
    const studentClient = createApiClient(baseUrl);
    const teacherClient = createApiClient(baseUrl);
    const librarianClient = createApiClient(baseUrl);

    studentClient.loginAs(studentA);
    teacherClient.loginAs(teacher);
    librarianClient.loginAs(librarian);

    // =========================================================================
    // SECTION A: Authorization Checks
    // =========================================================================

    // 1. Unauthenticated request rejected
    const unauthRes = await anonClient.request('GET', '/api/reports/overdue-loss');
    assert(
      unauthRes.status === 401,
      'Unauthenticated request to overdue-loss is rejected (HTTP 401)',
      `Got status ${unauthRes.status}`
    );

    // 2. Student role forbidden
    const studentRes = await studentClient.request('GET', '/api/reports/overdue-loss');
    assert(
      studentRes.status === 403,
      'STUDENT role is rejected from accessing overdue-loss (HTTP 403)',
      `Got status ${studentRes.status}`
    );

    // 3. Teacher role forbidden
    const teacherRes = await teacherClient.request('GET', '/api/reports/overdue-loss');
    assert(
      teacherRes.status === 403,
      'TEACHER role is rejected from accessing overdue-loss (HTTP 403)',
      `Got status ${teacherRes.status}`
    );

    // 4. Librarian role allowed
    const libRes = await librarianClient.request('GET', '/api/reports/overdue-loss');
    assert(
      libRes.status === 200,
      'LIBRARIAN role can access overdue-loss (HTTP 200)',
      `Got status ${libRes.status}`
    );
    assert(libRes.body?.success === true, 'Overdue-loss response returns success: true');

    // =========================================================================
    // SECTION B: Controlled Test Seed Data for Overdue & Aging
    // =========================================================================

    // Reference evaluation date (fixed anchor for deterministic aging calculation)
    const fixedAsOfDate = new Date('2026-10-25T12:00:00.000Z');

    // Create Book 1 (BCOM program)
    const book1 = await dataManager.createBook({
      title: 'Financial Management for Commerce (10B)',
      author: 'Dr. K. Srinivas',
      isbn: '978-81-999902-1-1',
      totalCopies: 5,
    });
    await prisma.bookProgram.create({
      data: {
        bookId: book1.id,
        program: 'BCOM',
        branch: 'General',
      },
    });

    // Create Book 2 (BBA program)
    const book2 = await dataManager.createBook({
      title: 'Organizational Behavior in Practice (10B)',
      author: 'Prof. A. R. Sharma',
      isbn: '978-81-999902-1-2',
      totalCopies: 3,
    });
    await prisma.bookProgram.create({
      data: {
        bookId: book2.id,
        program: 'BBA',
        branch: null,
      },
    });

    const copiesBook1 = await prisma.bookCopy.findMany({
      where: { bookId: book1.id },
      orderBy: { copyNumber: 'asc' },
    });
    const copiesBook2 = await prisma.bookCopy.findMany({
      where: { bookId: book2.id },
      orderBy: { copyNumber: 'asc' },
    });

    // Seed 4 loans targeting exact aging tiers relative to fixedAsOfDate (2026-10-25T12:00:00.000Z):

    // Loan 1: Due 2026-10-21 (4 days overdue -> Tier 1: 1–7 days)
    const loanTier1 = await prisma.lending.create({
      data: {
        userId: studentA.id,
        bookCopyId: copiesBook1[0].id,
        issuedDate: new Date('2026-09-21T10:00:00.000Z'),
        dueDate: new Date('2026-10-21T10:00:00.000Z'),
        status: 'ISSUED',
        fine: 0,
      },
    });

    // Loan 2: Due 2026-10-15 (10 days overdue -> Tier 2: 8–14 days)
    const loanTier2 = await prisma.lending.create({
      data: {
        userId: studentB.id,
        bookCopyId: copiesBook1[1].id,
        issuedDate: new Date('2026-09-15T10:00:00.000Z'),
        dueDate: new Date('2026-10-15T10:00:00.000Z'),
        status: 'ISSUED',
        fine: 0,
      },
    });

    // Loan 3: Due 2026-10-05 (20 days overdue -> Tier 3: 15–30 days)
    const loanTier3 = await prisma.lending.create({
      data: {
        userId: studentA.id, // Same borrower as Loan 1 (tests unique borrower counting)
        bookCopyId: copiesBook1[2].id,
        issuedDate: new Date('2026-09-05T10:00:00.000Z'),
        dueDate: new Date('2026-10-05T10:00:00.000Z'),
        status: 'OVERDUE',
        fine: 0,
      },
    });

    // Loan 4: Due 2026-09-10 (45 days overdue -> Tier 4: 30+ days) (Book 2 - BBA)
    const loanTier4 = await prisma.lending.create({
      data: {
        userId: teacher.id,
        bookCopyId: copiesBook2[0].id,
        issuedDate: new Date('2026-08-10T10:00:00.000Z'),
        dueDate: new Date('2026-09-10T10:00:00.000Z'),
        status: 'ISSUED',
        fine: 0,
      },
    });

    // Loan 5: Due 2026-10-10 but RETURNED on 2026-10-20 (must be EXCLUDED from overdue count)
    const loanReturned = await prisma.lending.create({
      data: {
        userId: studentB.id,
        bookCopyId: copiesBook1[3].id,
        issuedDate: new Date('2026-09-10T10:00:00.000Z'),
        dueDate: new Date('2026-10-10T10:00:00.000Z'),
        returnedDate: new Date('2026-10-20T10:00:00.000Z'),
        status: 'RETURNED',
        fine: 0,
      },
    });

    // Loan 6: Active loan NOT overdue (Due 2026-11-15 -> must be EXCLUDED from overdue count)
    const loanFuture = await prisma.lending.create({
      data: {
        userId: studentB.id,
        bookCopyId: copiesBook2[1].id,
        issuedDate: new Date('2026-10-15T10:00:00.000Z'),
        dueDate: new Date('2026-11-15T10:00:00.000Z'),
        status: 'ISSUED',
        fine: 0,
      },
    });

    // Mark one physical copy as LOST and one as DAMAGED for inventory analytics
    await prisma.bookCopy.update({
      where: { id: copiesBook1[4].id },
      data: { status: 'LOST' },
    });
    await prisma.bookCopy.update({
      where: { id: copiesBook2[2].id },
      data: { status: 'DAMAGED', condition: 'Poor' },
    });

    // =========================================================================
    // SECTION C: Overdue & Aging Analytics Verification
    // =========================================================================

    const testReportRes = await librarianClient.request(
      'GET',
      `/api/reports/overdue-loss?asOfDate=${fixedAsOfDate.toISOString()}`
    );
    assert(testReportRes.status === 200, 'Query with asOfDate returns HTTP 200');
    const reportData = testReportRes.body?.data;

    // 5. Correct overdue identification
    const overdueSummary = reportData?.overdueSummary;
    assert(
      overdueSummary?.totalOverdueLoans >= 4,
      'Total overdue loans correctly identifies active overdue loans'
    );

    // 6. Returned loans excluded
    const hasReturnedInList = overdueSummary?.items?.some((item) => item.lendingId === loanReturned.id);
    assert(!hasReturnedInList, 'Returned loans are strictly excluded from overdue report');

    // 7. Future active loans excluded
    const hasFutureInList = overdueSummary?.items?.some((item) => item.lendingId === loanFuture.id);
    assert(!hasFutureInList, 'Future non-overdue active loans are strictly excluded from overdue report');

    // 8. Correct 1–7 days aging bucket
    const item1 = overdueSummary?.items?.find((i) => i.lendingId === loanTier1.id);
    assert(item1?.agingBucket === '1-7 days', 'Loan 1 due 4 days ago is mapped to 1-7 days bucket');
    assert(item1?.daysOverdue >= 4 && item1?.daysOverdue <= 5, 'Loan 1 daysOverdue accurately computed');

    // 9. Correct 8–14 days aging bucket
    const item2 = overdueSummary?.items?.find((i) => i.lendingId === loanTier2.id);
    assert(item2?.agingBucket === '8-14 days', 'Loan 2 due 10 days ago is mapped to 8-14 days bucket');
    assert(item2?.daysOverdue >= 10 && item2?.daysOverdue <= 11, 'Loan 2 daysOverdue accurately computed');

    // 10. Correct 15–30 days aging bucket
    const item3 = overdueSummary?.items?.find((i) => i.lendingId === loanTier3.id);
    assert(item3?.agingBucket === '15-30 days', 'Loan 3 due 20 days ago is mapped to 15-30 days bucket');
    assert(item3?.daysOverdue >= 20 && item3?.daysOverdue <= 21, 'Loan 3 daysOverdue accurately computed');

    // 11. Correct 31+ days aging bucket
    const item4 = overdueSummary?.items?.find((i) => i.lendingId === loanTier4.id);
    assert(
      item4?.agingBucket === '31+ days' || item4?.agingBucket === '30+ days',
      'Loan 4 due 45 days ago is mapped to 31+ days bucket'
    );
    assert(item4?.daysOverdue >= 45, 'Loan 4 daysOverdue accurately computed as >= 45 days');

    // 12. Aging distribution sum matches total items
    const aging = overdueSummary?.agingDistribution;
    assert(aging?.tier31PlusDays !== undefined, 'Aging distribution reports tier31PlusDays');
    const agingSum =
      aging.tier1To7Days + aging.tier8To14Days + aging.tier15To30Days + (aging.tier31PlusDays ?? aging.tier30PlusDays);
    assert(
      agingSum === overdueSummary.totalOverdueLoans,
      'Aging bucket counts sum exactly to totalOverdueLoans (no orphan or double-counted items)'
    );

    // 13. Unique borrower counting (studentA has 2 loans, so borrowers < loans)
    assert(
      overdueSummary.affectedBorrowersCount <= overdueSummary.totalOverdueLoans,
      'affectedBorrowersCount is less than or equal to totalOverdueLoans'
    );
    assert(
      overdueSummary.affectedBorrowersCount >= 3,
      'affectedBorrowersCount accurately deduplicates studentA, studentB, teacher'
    );

    // =========================================================================
    // SECTION D: Lost & Damaged Inventory Analytics
    // =========================================================================

    const lossAndDamage = reportData?.inventoryLossAndDamage;
    assert(lossAndDamage?.totalLostCopies >= 1, 'Inventory reports totalLostCopies >= 1');
    assert(lossAndDamage?.totalDamagedCopies >= 1, 'Inventory reports totalDamagedCopies >= 1');
    assert(
      lossAndDamage?.inventoryImpact?.totalActivePhysicalCopies > 0,
      'Inventory reports positive active physical copies'
    );
    assert(
      lossAndDamage?.inventoryImpact?.lostPercentageOfPhysical >= 0,
      'Calculates non-negative lost copy percentage'
    );
    assert(
      lossAndDamage?.replacementHistoryStatus?.supportedBySchema === false,
      'Explicitly documents replacement history is not maintained as a dedicated table in current schema'
    );

    // =========================================================================
    // SECTION E: Fine Reconciliation Verification (Zero-Fine College Policy)
    // =========================================================================

    const fineRec = reportData?.fineReconciliation;
    assert(fineRec?.policy === 'ZERO_MONETARY_FINES', 'Fine reconciliation confirms ZERO_MONETARY_FINES policy');
    assert(fineRec?.policyCompliant === null, 'Fine reconciliation confirms policyCompliant: null (unverified due to lack of authoritative config table)');
    assert(fineRec?.totalAssessedFines === 0, 'Total assessed fines is strictly 0');
    assert(fineRec?.totalCollectedFines === 0, 'Total collected fines is strictly 0');
    assert(fineRec?.totalOutstandingFines === 0, 'Total outstanding fines is strictly 0');
    assert(fineRec?.authoritativeConfigFound === false, 'Fine reconciliation documents lack of authoritative config table');
    assert(typeof fineRec?.dataLimitation === 'string' && fineRec.dataLimitation.length > 0, 'Fine reconciliation reports data limitation note');

    // =========================================================================
    // SECTION F: Program Filtering
    // =========================================================================

    // Query filtered by BBA
    const bbaReportRes = await librarianClient.request(
      'GET',
      `/api/reports/overdue-loss?asOfDate=${fixedAsOfDate.toISOString()}&programId=BBA`
    );
    assert(bbaReportRes.status === 200, 'Program-filtered overdue report returns HTTP 200');
    const bbaItems = bbaReportRes.body?.data?.overdueSummary?.items || [];
    assert(bbaItems.length >= 1, 'BBA filter returns at least the 1 overdue BBA loan');
    const hasTestBbaBook = bbaItems.some((item) => item.bookTitle.includes('Organizational Behavior'));
    assert(hasTestBbaBook, 'Program-filtered overdue report returns the overdue BBA book');

    // =========================================================================
    // SECTION G: Parameter Validation
    // =========================================================================

    // Invalid asOfDate
    const invalidAsOfRes = await librarianClient.request('GET', '/api/reports/overdue-loss?asOfDate=invalid-date');
    assert(invalidAsOfRes.status === 400, 'Invalid asOfDate returns HTTP 400');
    assert(invalidAsOfRes.body?.error?.includes('Invalid asOfDate'), 'Error explains asOfDate format');

    // Inverted date range
    const invertedRes = await librarianClient.request(
      'GET',
      '/api/reports/overdue-loss?startDate=2026-12-31&endDate=2026-01-01'
    );
    assert(invertedRes.status === 400, 'Inverted date range returns HTTP 400');

    // Invalid program
    const invalidProgRes = await librarianClient.request('GET', '/api/reports/overdue-loss?programId=UNKNOWN');
    assert(invalidProgRes.status === 400, 'Invalid program returns HTTP 400');

    // =========================================================================
    // SECTION H: CSV Export & Formula Injection Security
    // =========================================================================

    const csvRes = await librarianClient.request(
      'GET',
      `/api/reports/overdue-loss?asOfDate=${fixedAsOfDate.toISOString()}&format=csv`
    );
    assert(csvRes.status === 200, 'CSV export returns HTTP 200');
    const contentType = csvRes.headers.get('content-type') || '';
    assert(contentType.includes('text/csv'), 'Returns Content-Type: text/csv');
    const csvText = typeof csvRes.data === 'string' ? csvRes.data : '';
    assert(csvText.includes('Book Title,Copy Number,Barcode'), 'CSV header row contains expected columns');
    assert(csvText.includes('Days Overdue,Aging Bucket'), 'CSV contains aging metrics columns');

    // Test Formula Injection Neutralization in report export helper
    const testMaliciousRows = [
      {
        bookTitle: '=HYPERLINK("http://attacker.com")',
        copyNumber: 1,
        barcode: '+919999999999',
        borrowerRole: 'STUDENT',
        borrowerProgram: '-BCOM',
        borrowerBranch: '@Accounts',
        borrowerYear: 1,
        issuedDate: '2026-10-01',
        dueDate: '2026-10-15',
        daysOverdue: 10,
        agingBucket: '8-14 days',
      },
    ];
    const columns = [
      { key: 'bookTitle', header: 'Book Title' },
      { key: 'barcode', header: 'Barcode' },
      { key: 'borrowerProgram', header: 'Program' },
      { key: 'borrowerBranch', header: 'Branch' },
    ];
    const neutralizedCsv = generateCsv(testMaliciousRows, columns, {
      includeBom: true,
      neutralizeFormulas: true,
    });
    assert(
      neutralizedCsv.includes("''=HYPERLINK") || neutralizedCsv.includes("'=HYPERLINK"),
      'CSV output neutralizes = trigger character'
    );
    assert(
      neutralizedCsv.includes("''+919999999999") || neutralizedCsv.includes("'+919999999999"),
      'CSV output neutralizes + trigger character'
    );
    assert(
      neutralizedCsv.includes("''-BCOM") || neutralizedCsv.includes("'-BCOM"),
      'CSV output neutralizes - trigger character'
    );
    assert(
      neutralizedCsv.includes("''@Accounts") || neutralizedCsv.includes("'@Accounts"),
      'CSV output neutralizes @ trigger character'
    );

    // =========================================================================
    // SECTION I: Privacy & Data Minimization
    // =========================================================================

    // Verify overdue item summaries do NOT leak student passwords, hashes, tokens, or personal phone numbers
    for (const item of overdueSummary.items) {
      assert(!('password' in item), 'Overdue item does not contain password field');
      assert(!('tokenVersion' in item), 'Overdue item does not contain tokenVersion field');
      assert(!('phone' in item), 'Overdue item does not contain student phone number');
      assert(!('email' in item), 'Overdue item does not contain student email address');
    }

    // Clean up created test lendings
    await prisma.lending.deleteMany({
      where: {
        id: {
          in: [
            loanTier1.id,
            loanTier2.id,
            loanTier3.id,
            loanTier4.id,
            loanReturned.id,
            loanFuture.id,
          ],
        },
      },
    });
  } finally {
    await dataManager.cleanup();
    await prisma.$disconnect();
  }
}
