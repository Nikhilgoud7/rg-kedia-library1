// tests/suites/reportingInventoryAnalytics.test.js — Phase 10C Inventory Condition, Shelf-Audit & Reconciliation Analytics
import { PrismaClient } from '@prisma/client';
import { createApiClient } from '../helpers/apiClient.js';
import { TestDataManager } from '../helpers/testData.js';
import { ReportingService } from '../../dist/server/services/reportingService.js';
import { logAdminAction, AUDIT_ACTIONS } from '../../dist/server/lib/auditLogger.js';

export async function runReportingInventoryAnalyticsTests(baseUrl, assert) {
  const prisma = new PrismaClient();
  const dataManager = new TestDataManager();

  const createdBookIds = [];
  const createdCopyIds = [];
  const createdAuditLogIds = [];

  try {
    // -------------------------------------------------------------------------
    // Setup Test Personas
    // -------------------------------------------------------------------------
    const student = await dataManager.createStudent({ tag: 'ia_stu' });
    const teacher = await dataManager.createTeacher({ tag: 'ia_tea' });
    const librarian = await dataManager.createLibrarian({ tag: 'ia_lib' });

    const anonClient = createApiClient(baseUrl);
    const studentClient = createApiClient(baseUrl);
    const teacherClient = createApiClient(baseUrl);
    const librarianClient = createApiClient(baseUrl);

    studentClient.loginAs(student);
    teacherClient.loginAs(teacher);
    librarianClient.loginAs(librarian);

    // =========================================================================
    // SECTION A: Authorization Checks (Strict LIBRARIAN RBAC)
    // =========================================================================

    // 1. Unauthenticated request rejected
    const unauthRes = await anonClient.request('GET', '/api/reports/inventory-analytics');
    assert(
      unauthRes.status === 401,
      'Unauthenticated request to inventory-analytics is rejected (HTTP 401)',
      `Got status ${unauthRes.status}`
    );

    // 2. Student role forbidden
    const studentRes = await studentClient.request('GET', '/api/reports/inventory-analytics');
    assert(
      studentRes.status === 403,
      'STUDENT role is rejected from accessing inventory-analytics (HTTP 403)',
      `Got status ${studentRes.status}`
    );

    // 3. Teacher role forbidden
    const teacherRes = await teacherClient.request('GET', '/api/reports/inventory-analytics');
    assert(
      teacherRes.status === 403,
      'TEACHER role is rejected from accessing inventory-analytics (HTTP 403)',
      `Got status ${teacherRes.status}`
    );

    // 4. Librarian role allowed
    const libRes = await librarianClient.request('GET', '/api/reports/inventory-analytics');
    assert(
      libRes.status === 200,
      'LIBRARIAN role can access inventory-analytics (HTTP 200)',
      `Got status ${libRes.status}`
    );
    assert(
      libRes.body?.success === true,
      'Inventory-analytics response reports success: true'
    );

    // =========================================================================
    // SECTION B: Test Data Setup (Controlled Inventory & Audit Drift)
    // =========================================================================

    const testTag = Date.now().toString(36);

    // Create a BCOM test book with diverse physical copy conditions and statuses
    const testBookBcom = await prisma.book.create({
      data: {
        title: `Financial Management Analytics [${testTag}]`,
        author: 'Dr. Kedia Faculty',
        isbn: `978-81-${Math.floor(10000000 + Math.random() * 90000000)}`,
        publisher: 'Kedia Academic Press',
        edition: '1st Edition',
        publicationYear: 2024,
        category: 'Commerce',
        segment: 'Degree',
        description: 'Comprehensive financial management and inventory accounting.',
        totalCopies: 5,
        availableCopies: 2,
        bookPrograms: {
          create: [{ program: 'BCOM', branch: 'General' }],
        },
      },
    });
    createdBookIds.push(testBookBcom.id);

    // Create 5 copies with specific condition grades and statuses
    // Copy 1: Good, AVAILABLE, Rack A-1
    const copy1 = await prisma.bookCopy.create({
      data: {
        bookId: testBookBcom.id,
        copyNumber: 1,
        condition: 'Good',
        status: 'AVAILABLE',
        barcode: `IA-G-AV-${testTag}-1`,
        shelfLocation: 'Rack A-1',
      },
    });
    createdCopyIds.push(copy1.id);

    // Copy 2: Fair, ISSUED, Rack A-1
    const copy2 = await prisma.bookCopy.create({
      data: {
        bookId: testBookBcom.id,
        copyNumber: 2,
        condition: 'Fair',
        status: 'ISSUED',
        barcode: `IA-F-IS-${testTag}-2`,
        shelfLocation: 'Rack A-1',
      },
    });
    createdCopyIds.push(copy2.id);

    // Copy 3: Poor, RESERVED, Rack B-2
    const copy3 = await prisma.bookCopy.create({
      data: {
        bookId: testBookBcom.id,
        copyNumber: 3,
        condition: 'Poor',
        status: 'RESERVED',
        barcode: `IA-P-RS-${testTag}-3`,
        shelfLocation: 'Rack B-2',
      },
    });
    createdCopyIds.push(copy3.id);

    // Copy 4: Damaged, DAMAGED, no shelf location
    const copy4 = await prisma.bookCopy.create({
      data: {
        bookId: testBookBcom.id,
        copyNumber: 4,
        condition: 'Damaged',
        status: 'DAMAGED',
        barcode: `IA-D-DM-${testTag}-4`,
        shelfLocation: null,
      },
    });
    createdCopyIds.push(copy4.id);

    // Copy 5: Good, WITHDRAWN (historical retired copy, must NOT count in active inventory)
    const copy5 = await prisma.bookCopy.create({
      data: {
        bookId: testBookBcom.id,
        copyNumber: 5,
        condition: 'Good',
        status: 'WITHDRAWN',
        barcode: `IA-G-WD-${testTag}-5`,
        shelfLocation: 'Archive Storage',
      },
    });
    createdCopyIds.push(copy5.id);

    // Create a BBA book for program filtering verification
    const testBookBba = await prisma.book.create({
      data: {
        title: `=SUM(1+1) Marketing Principles [${testTag}]`, // Formula injection trigger in title
        author: 'Prof. Sharma',
        isbn: `978-81-${Math.floor(10000000 + Math.random() * 90000000)}`,
        publisher: 'Kedia Academic Press',
        edition: '2nd Edition',
        publicationYear: 2024,
        category: 'Management',
        segment: 'Degree',
        description: 'Marketing management textbook.',
        totalCopies: 1,
        availableCopies: 1,
        bookPrograms: {
          create: [{ program: 'BBA', branch: 'General' }],
        },
      },
    });
    createdBookIds.push(testBookBba.id);

    const copyBba = await prisma.bookCopy.create({
      data: {
        bookId: testBookBba.id,
        copyNumber: 1,
        condition: 'Good',
        status: 'AVAILABLE',
        barcode: `@BBA-FORMULA-${testTag}`, // Formula injection trigger in barcode
        shelfLocation: '+Rack-Formula-1', // Formula injection trigger in shelf location
      },
    });
    createdCopyIds.push(copyBba.id);

    // Create synthetic INVENTORY_RECONCILED audit logs to test drift analytics
    const auditLogReconcile = await prisma.auditLog.create({
      data: {
        actorId: librarian.id,
        action: 'INVENTORY_RECONCILED',
        targetId: testBookBcom.id,
        details: JSON.stringify({
          bookId: testBookBcom.id,
          bookTitle: testBookBcom.title,
          previousTotalCopies: 8,
          correctedTotalCopies: 5,
          previousAvailableCopies: 4,
          correctedAvailableCopies: 2,
          totalDrift: -3,
          availableDrift: -2,
        }),
      },
    });
    createdAuditLogIds.push(auditLogReconcile.id);

    const auditLogReconcilePositive = await prisma.auditLog.create({
      data: {
        actorId: librarian.id,
        action: 'INVENTORY_RECONCILED',
        targetId: testBookBba.id,
        details: JSON.stringify({
          bookId: testBookBba.id,
          bookTitle: testBookBba.title,
          previousTotalCopies: 0,
          correctedTotalCopies: 1,
          previousAvailableCopies: 0,
          correctedAvailableCopies: 1,
          totalDrift: 1,
          availableDrift: 1,
        }),
      },
    });
    createdAuditLogIds.push(auditLogReconcilePositive.id);

    // =========================================================================
    // SECTION C: Direct Service Invocation & Condition Analytics Verification
    // =========================================================================

    const serviceResult = await ReportingService.getInventoryAnalytics();

    assert(serviceResult !== null && typeof serviceResult === 'object', 'Service returns valid report object');
    assert(typeof serviceResult.generatedAt === 'string', 'Report includes generatedAt timestamp string');

    const invCond = serviceResult.inventoryCondition;
    assert(invCond !== null && typeof invCond === 'object', 'Report includes inventoryCondition summary');
    assert(typeof invCond.eligibleActiveCopiesCount === 'number', 'eligibleActiveCopiesCount is a number');
    assert(typeof invCond.withdrawnCopiesCount === 'number', 'withdrawnCopiesCount is a number');
    assert(invCond.withdrawnCopiesCount >= 1, 'withdrawnCopiesCount accurately includes copy 5 (WITHDRAWN)');
    assert(
      invCond.totalAllCopiesCount === invCond.eligibleActiveCopiesCount + invCond.withdrawnCopiesCount,
      'totalAllCopiesCount strictly equals eligibleActiveCopiesCount + withdrawnCopiesCount'
    );

    // Supported condition grades
    assert(Array.isArray(invCond.supportedConditionGrades), 'supportedConditionGrades is an array');
    assert(
      invCond.supportedConditionGrades.length === 4 &&
        invCond.supportedConditionGrades.includes('Good') &&
        invCond.supportedConditionGrades.includes('Fair') &&
        invCond.supportedConditionGrades.includes('Poor') &&
        invCond.supportedConditionGrades.includes('Damaged'),
      'Supported condition grades strictly match actual schema values: Good, Fair, Poor, Damaged'
    );
    assert(
      !invCond.supportedConditionGrades.includes('New'),
      'Condition grade "New" is not falsely reported as supported (honesty in schema capabilities)'
    );

    // Condition distribution counts & percentages
    const dist = invCond.conditionDistribution;
    assert(typeof dist.good.count === 'number', 'good condition count is numeric');
    assert(typeof dist.good.percentage === 'number', 'good condition percentage is numeric');
    assert(typeof dist.fair.count === 'number', 'fair condition count is numeric');
    assert(typeof dist.poor.count === 'number', 'poor condition count is numeric');
    assert(typeof dist.damaged.count === 'number', 'damaged condition count is numeric');
    assert(typeof dist.unknown.count === 'number', 'unknown condition count is numeric');

    assert(dist.good.count >= 2, 'Counts at least 2 active Good copies (copy1 + copyBba)');
    assert(dist.fair.count >= 1, 'Counts at least 1 active Fair copy (copy2)');
    assert(dist.poor.count >= 1, 'Counts at least 1 active Poor copy (copy3)');
    assert(dist.damaged.count >= 1, 'Counts at least 1 active Damaged copy (copy4)');

    // Verification that category totals sum to eligible population
    const condSum =
      dist.good.count + dist.fair.count + dist.poor.count + dist.damaged.count + dist.unknown.count;
    assert(
      condSum === invCond.eligibleActiveCopiesCount,
      'Condition category counts sum strictly equals eligibleActiveCopiesCount (100% reconciliation)'
    );
    assert(
      invCond.reconciliationSummary.isFullyReconciled === true,
      'reconciliationSummary.isFullyReconciled is true'
    );

    // Status distribution
    const stDist = invCond.statusDistribution;
    assert(typeof stDist.available === 'number', 'available status count is numeric');
    assert(typeof stDist.issued === 'number', 'issued status count is numeric');
    assert(typeof stDist.reserved === 'number', 'reserved status count is numeric');
    assert(typeof stDist.lost === 'number', 'lost status count is numeric');
    assert(typeof stDist.damaged === 'number', 'damaged status count is numeric');

    const statusSum =
      stDist.available + stDist.issued + stDist.reserved + stDist.lost + stDist.damaged;
    assert(
      statusSum === invCond.eligibleActiveCopiesCount,
      'Status distribution counts sum strictly equals eligibleActiveCopiesCount'
    );

    // Cross status breakdown
    assert(typeof invCond.crossStatusBreakdown === 'object', 'crossStatusBreakdown is an object');
    assert(invCond.crossStatusBreakdown['Good'] !== undefined, 'crossStatusBreakdown includes Good');
    assert(invCond.crossStatusBreakdown['Fair'] !== undefined, 'crossStatusBreakdown includes Fair');
    assert(invCond.crossStatusBreakdown['Poor'] !== undefined, 'crossStatusBreakdown includes Poor');
    assert(invCond.crossStatusBreakdown['Damaged'] !== undefined, 'crossStatusBreakdown includes Damaged');
    assert(invCond.crossStatusBreakdown['Fair'].issued >= 1, 'crossStatusBreakdown tracks copy2 as Fair and ISSUED');
    assert(invCond.crossStatusBreakdown['Poor'].reserved >= 1, 'crossStatusBreakdown tracks copy3 as Poor and RESERVED');

    // =========================================================================
    // SECTION D: Shelf-Audit Truth & Discrepancy Verification (No Data Fabrication)
    // =========================================================================

    const shelfAudit = serviceResult.shelfAudit;
    assert(shelfAudit !== null && typeof shelfAudit === 'object', 'shelfAudit object is present');
    assert(
      shelfAudit.physicalObservationsRecorded === false,
      'physicalObservationsRecorded is strictly false (truth in data capability)'
    );
    assert(
      shelfAudit.physicalObservationsCount === 0,
      'physicalObservationsCount is strictly 0'
    );
    assert(
      shelfAudit.misplacedCopiesDetectable === false,
      'misplacedCopiesDetectable is strictly false (no synthetic observations claimed)'
    );
    assert(
      typeof shelfAudit.dataLimitation === 'string' && shelfAudit.dataLimitation.length > 20,
      'dataLimitation clearly articulates missing physical observation data capability'
    );
    assert(
      typeof shelfAudit.minimumFutureRequirement === 'string' &&
        shelfAudit.minimumFutureRequirement.includes('ShelfAuditObservation'),
      'minimumFutureRequirement specifies minimum table requirements for future capability'
    );

    // Catalog location summary
    const catLoc = shelfAudit.catalogLocationSummary;
    assert(catLoc.copiesWithShelfLocationCount >= 4, 'Catalog location tracks copies with shelf locations');
    assert(catLoc.copiesWithoutShelfLocationCount >= 1, 'Catalog location tracks copy4 with null shelf location');
    assert(catLoc.uniqueShelfLocationsCount >= 2, 'Catalog location tracks distinct shelf locations (Rack A-1, Rack B-2)');
    assert(
      catLoc.copiesWithShelfLocationCount + catLoc.copiesWithoutShelfLocationCount ===
        invCond.eligibleActiveCopiesCount,
      'Shelf location counts reconcile with active copy population'
    );
    assert(
      catLoc.shelfLocationCoveragePercentage > 0 && catLoc.shelfLocationCoveragePercentage <= 100,
      'shelfLocationCoveragePercentage is within valid 0-100 range'
    );

    // =========================================================================
    // SECTION E: Reconciliation Drift Analytics Verification
    // =========================================================================

    const drift = serviceResult.reconciliationDrift;
    assert(drift !== null && typeof drift === 'object', 'reconciliationDrift object is present');
    assert(drift.reconciliationEventsCount >= 2, 'reconciliationEventsCount captures seeded reconciliation events');
    assert(drift.reconciledBooksCount >= 2, 'reconciledBooksCount captures distinct reconciled books');
    assert(typeof drift.netTotalCopiesDrift === 'number', 'netTotalCopiesDrift is a numeric aggregate');
    assert(typeof drift.netAvailableCopiesDrift === 'number', 'netAvailableCopiesDrift is a numeric aggregate');
    assert(drift.negativeAdjustmentsCount >= 1, 'Tracks at least 1 negative drift adjustment event');
    assert(drift.positiveAdjustmentsCount >= 1, 'Tracks at least 1 positive drift adjustment event');
    assert(typeof drift.zeroDriftAuditsCount === 'number', 'zeroDriftAuditsCount is numeric');
    assert(drift.unparseableAuditLogsCount === 0, 'Zero unparseable audit logs among valid JSON logs');
    assert(typeof drift.lifecycleEvents === 'object', 'lifecycleEvents summary is present');
    assert(typeof drift.lifecycleEvents.copyAdditionsCount === 'number', 'copyAdditionsCount is numeric');
    assert(typeof drift.lifecycleEvents.copyDeletionsCount === 'number', 'copyDeletionsCount is numeric');
    assert(typeof drift.lifecycleEvents.copyWithdrawalsCount === 'number', 'copyWithdrawalsCount is numeric');
    assert(typeof drift.lifecycleEvents.copyLostEventsCount === 'number', 'copyLostEventsCount is numeric');
    assert(typeof drift.lifecycleEvents.copyDamagedEventsCount === 'number', 'copyDamagedEventsCount is numeric');
    assert(
      typeof drift.limitationNote === 'string' && drift.limitationNote.includes('INVENTORY_RECONCILED'),
      'limitationNote clearly clarifies scope of drift adjustments vs operational copy events'
    );

    // =========================================================================
    // SECTION F: API Parameter Validation & Program Filtering
    // =========================================================================

    // Invalid program filter
    const badProgRes = await librarianClient.request(
      'GET',
      '/api/reports/inventory-analytics?programId=INVALID_PROG'
    );
    assert(badProgRes.status === 400, 'Invalid programId returns HTTP 400');
    assert(
      badProgRes.body?.error?.includes('Invalid program filter'),
      'Error message identifies invalid program'
    );

    // Invalid date filter
    const badDateRes = await librarianClient.request(
      'GET',
      '/api/reports/inventory-analytics?startDate=not-a-date'
    );
    assert(badDateRes.status === 400, 'Invalid startDate returns HTTP 400');

    // Date ordering mismatch
    const badOrderRes = await librarianClient.request(
      'GET',
      '/api/reports/inventory-analytics?startDate=2026-12-01&endDate=2026-01-01'
    );
    assert(badOrderRes.status === 400, 'startDate after endDate returns HTTP 400');

    // Invalid format
    const badFmtRes = await librarianClient.request(
      'GET',
      '/api/reports/inventory-analytics?format=xml'
    );
    assert(badFmtRes.status === 400, 'Invalid format parameter returns HTTP 400');

    // Valid program filter (BBA)
    const bbaRes = await librarianClient.request(
      'GET',
      '/api/reports/inventory-analytics?programId=BBA'
    );
    assert(bbaRes.status === 200, 'Valid programId=BBA returns HTTP 200');
    const bbaCopies = bbaRes.body?.data?.copies || [];
    assert(bbaCopies.length >= 1, 'BBA filter returns at least 1 BBA copy');
    const hasBbaTestBook = bbaCopies.some((c) => c.bookTitle.includes('Marketing Principles'));
    assert(hasBbaTestBook, 'Program filter correctly includes the BBA test book');

    // =========================================================================
    // SECTION G: CSV Export & Formula Injection Protection
    // =========================================================================

    const csvRes = await librarianClient.request(
      'GET',
      '/api/reports/inventory-analytics?format=csv'
    );
    assert(csvRes.status === 200, 'CSV format export returns HTTP 200');
    const contentType = csvRes.headers.get('content-type') || '';
    assert(
      contentType.includes('text/csv'),
      'CSV response has Content-Type: text/csv'
    );
    const contentDisp = csvRes.headers.get('content-disposition') || '';
    assert(
      contentDisp.includes('inventory-analytics.csv'),
      'CSV response Content-Disposition filename is inventory-analytics.csv'
    );

    const wireRawRes = await fetch(`${baseUrl}/api/reports/inventory-analytics?format=csv`, {
      headers: { Cookie: librarianClient.getCookie() },
    });
    const wireBuffer = Buffer.from(await wireRawRes.arrayBuffer());
    assert(
      wireBuffer.length >= 3 && wireBuffer[0] === 0xef && wireBuffer[1] === 0xbb && wireBuffer[2] === 0xbf,
      'CSV begins with UTF-8 BOM character (0xEF 0xBB 0xBF) on wire'
    );

    const csvBody = typeof csvRes.body === 'string' ? csvRes.body : '';

    const csvLines = csvBody.split(/\r?\n/).filter((l) => l.trim().length > 0);
    assert(csvLines.length >= 2, 'CSV export contains header and data rows');

    const headerLine = csvLines[0];
    assert(headerLine.includes('Book Title'), 'CSV header includes "Book Title"');
    assert(headerLine.includes('Copy Number'), 'CSV header includes "Copy Number"');
    assert(headerLine.includes('Barcode'), 'CSV header includes "Barcode"');
    assert(headerLine.includes('Condition'), 'CSV header includes "Condition"');
    assert(headerLine.includes('Status'), 'CSV header includes "Status"');
    assert(headerLine.includes('Shelf Location'), 'CSV header includes "Shelf Location"');
    assert(headerLine.includes('Programs'), 'CSV header includes "Programs"');

    // Formula injection verification:
    // In testBookBba: title begins with '=SUM(1+1)'
    // In copyBba: barcode begins with '@BBA-FORMULA'
    // In copyBba: shelfLocation begins with '+Rack-Formula-1'
    const bbaCsvLine = csvLines.find((l) => l.includes('Marketing Principles'));
    assert(bbaCsvLine !== undefined, 'CSV contains BBA test book line');
    assert(
      bbaCsvLine.includes("'=SUM(1+1)") || bbaCsvLine.includes("'=SUM"),
      'Formula trigger "=" in Book Title is sanitized with leading apostrophe'
    );
    assert(
      bbaCsvLine.includes("'@BBA-FORMULA"),
      'Formula trigger "@" in Barcode is sanitized with leading apostrophe'
    );
    assert(
      bbaCsvLine.includes("'+Rack-Formula-1"),
      'Formula trigger "+" in Shelf Location is sanitized with leading apostrophe'
    );

    // =========================================================================
    // SECTION H: PII Minimization & Security Audit
    // =========================================================================

    const jsonReport = libRes.body;
    const jsonString = JSON.stringify(jsonReport);

    assert(!jsonString.includes('password'), 'Report does not leak password field');
    assert(!jsonString.includes('tokenVersion'), 'Report does not leak tokenVersion');
    assert(!jsonString.includes(student.email), 'Report does not leak student email');
    assert(!jsonString.includes(teacher.email), 'Report does not leak teacher email');
    if (student.phone) {
      assert(!jsonString.includes(student.phone), 'Report does not leak student phone');
    }

  } finally {
    // -------------------------------------------------------------------------
    // Cleanup Test Records
    // -------------------------------------------------------------------------
    for (const logId of createdAuditLogIds) {
      await prisma.auditLog.deleteMany({ where: { id: logId } }).catch(() => {});
    }
    for (const copyId of createdCopyIds) {
      await prisma.bookCopy.deleteMany({ where: { id: copyId } }).catch(() => {});
    }
    for (const bookId of createdBookIds) {
      await prisma.book.deleteMany({ where: { id: bookId } }).catch(() => {});
    }
    await dataManager.cleanup().catch(() => {});
    await prisma.$disconnect();
  }
}
