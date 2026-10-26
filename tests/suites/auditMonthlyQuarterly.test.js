// tests/suites/auditMonthlyQuarterly.test.js — Phase 11B Monthly & Quarterly Operational Audits Test Suite
import { PrismaClient } from '@prisma/client';
import { createApiClient } from '../helpers/apiClient.js';
import { TestDataManager } from '../helpers/testData.js';

export async function runAuditMonthlyQuarterlyTests(baseUrl, assert) {
  const prisma = new PrismaClient();
  const dataManager = new TestDataManager();
  const createdAuditIds = [];

  try {
    // -------------------------------------------------------------------------
    // Setup Test Personas & Test Data
    // -------------------------------------------------------------------------
    const student = await dataManager.createStudent({ tag: 'mq_stu' });
    const teacher = await dataManager.createTeacher({ tag: 'mq_tea' });
    const librarian = await dataManager.createLibrarian({ tag: 'mq_lib' });

    const anonClient = createApiClient(baseUrl);
    const studentClient = createApiClient(baseUrl);
    const teacherClient = createApiClient(baseUrl);
    const librarianClient = createApiClient(baseUrl);

    studentClient.loginAs(student);
    teacherClient.loginAs(teacher);
    librarianClient.loginAs(librarian);

    // Create test book and copies
    const bookA = await dataManager.createBook({
      title: 'Advanced Financial Accounting - Audit Test',
      category: 'TEXTBOOK',
      copiesCount: 3,
    });

    // Create a historical lending in March 2026
    const copyA1 = await prisma.bookCopy.findFirst({
      where: { bookId: bookA.id },
    });

    // =========================================================================
    // SECTION A: Authorization Checks
    // =========================================================================

    // 1. Initiate Monthly Audit for testing
    const monthStart = '2026-03-01';
    const monthEnd = '2026-03-31';

    const createMonthRes = await librarianClient.request('POST', '/api/audits', {
      body: {
        type: 'MONTHLY',
        title: 'Monthly Library Operations Review — March 2026',
        periodStart: monthStart,
        periodEnd: monthEnd,
        academicYear: '2025-2026',
        observations: 'Testing operational compilation for March 2026.',
      },
    });

    assert(
      createMonthRes.status === 201,
      'Librarian can create test monthly audit (HTTP 201)',
      `Got status ${createMonthRes.status}`
    );
    const monthlyAudit = createMonthRes.body?.data;
    if (monthlyAudit?.id) createdAuditIds.push(monthlyAudit.id);

    // 2. Unauthenticated request to /report rejected
    const unauthReport = await anonClient.request('GET', `/api/audits/${monthlyAudit.id}/report`);
    assert(
      unauthReport.status === 401,
      'Unauthenticated request to audit report is rejected (HTTP 401)',
      `Got status ${unauthReport.status}`
    );

    // 3. STUDENT rejected from /report
    const studentReport = await studentClient.request('GET', `/api/audits/${monthlyAudit.id}/report`);
    assert(
      studentReport.status === 403,
      'STUDENT role is rejected from audit report (HTTP 403)',
      `Got status ${studentReport.status}`
    );

    // 4. TEACHER rejected from /report
    const teacherReport = await teacherClient.request('GET', `/api/audits/${monthlyAudit.id}/report`);
    assert(
      teacherReport.status === 403,
      'TEACHER role is rejected from audit report (HTTP 403)',
      `Got status ${teacherReport.status}`
    );

    // 5. Unauthenticated request to /compile-snapshot rejected
    const unauthCompile = await anonClient.request('POST', `/api/audits/${monthlyAudit.id}/compile-snapshot`);
    assert(
      unauthCompile.status === 401,
      'Unauthenticated request to compile-snapshot is rejected (HTTP 401)',
      `Got status ${unauthCompile.status}`
    );

    // 6. STUDENT rejected from /compile-snapshot
    const studentCompile = await studentClient.request('POST', `/api/audits/${monthlyAudit.id}/compile-snapshot`);
    assert(
      studentCompile.status === 403,
      'STUDENT role is rejected from compile-snapshot (HTTP 403)',
      `Got status ${studentCompile.status}`
    );

    // =========================================================================
    // SECTION B: Monthly Operational Audit Report Compilation
    // =========================================================================

    // 7. Librarian can access live compiled report
    const liveReportRes = await librarianClient.request('GET', `/api/audits/${monthlyAudit.id}/report`);
    assert(
      liveReportRes.status === 200,
      'Librarian can retrieve monthly audit operational report (HTTP 200)',
      `Got status ${liveReportRes.status}`
    );
    assert(
      liveReportRes.body?.success === true,
      'Report response returns success: true',
      `Got: ${JSON.stringify(liveReportRes.body)}`
    );
    assert(
      liveReportRes.body?.isFrozenSnapshot === false,
      'Active in-progress audit returns isFrozenSnapshot: false',
      `Got: ${liveReportRes.body?.isFrozenSnapshot}`
    );

    const reportData = liveReportRes.body?.data;
    assert(
      Boolean(reportData?.compiledAt),
      'Report contains compiledAt timestamp',
      `Got: ${reportData?.compiledAt}`
    );

    // 8. Verify collection inventory metrics
    assert(
      typeof reportData?.collection?.totalTitles === 'number' && reportData.collection.totalTitles >= 1,
      'Report contains valid totalTitles count',
      `Got: ${reportData?.collection?.totalTitles}`
    );
    assert(
      typeof reportData?.collection?.totalCopies === 'number' && reportData.collection.totalCopies >= 3,
      'Report contains valid totalCopies count',
      `Got: ${reportData?.collection?.totalCopies}`
    );
    assert(
      typeof reportData?.collection?.availableCopies === 'number',
      'Report contains valid availableCopies count',
      `Got: ${reportData?.collection?.availableCopies}`
    );
    assert(
      typeof reportData?.collection?.shelfLocationCoveragePercentage === 'number',
      'Report contains shelfLocationCoveragePercentage',
      `Got: ${reportData?.collection?.shelfLocationCoveragePercentage}`
    );

    // 9. Verify circulation metrics
    assert(
      typeof reportData?.circulation?.totalIssued === 'number',
      'Report contains totalIssued circulation count',
      `Got: ${reportData?.circulation?.totalIssued}`
    );
    assert(
      typeof reportData?.circulation?.totalReturned === 'number',
      'Report contains totalReturned circulation count',
      `Got: ${reportData?.circulation?.totalReturned}`
    );
    assert(
      Array.isArray(reportData?.circulation?.breakdown),
      'Report contains circulation breakdown array',
      `Got: ${typeof reportData?.circulation?.breakdown}`
    );

    // 10. Verify delinquency and condition grades
    assert(
      typeof reportData?.overdueAging?.totalOverdueLoans === 'number',
      'Report contains totalOverdueLoans count',
      `Got: ${reportData?.overdueAging?.totalOverdueLoans}`
    );
    assert(
      typeof reportData?.overdueAging?.agingDistribution === 'object',
      'Report contains 4-tier agingDistribution breakdown',
      `Got: ${JSON.stringify(reportData?.overdueAging?.agingDistribution)}`
    );
    assert(
      typeof reportData?.conditionGrades?.good === 'number',
      'Report contains conditionGrades.good count',
      `Got: ${reportData?.conditionGrades?.good}`
    );

    // =========================================================================
    // SECTION C: Quarterly Operational Audit Consolidation
    // =========================================================================

    // 11. Create a Quarterly Audit
    const qStart = '2026-01-01';
    const qEnd = '2026-03-31';

    const createQuarterRes = await librarianClient.request('POST', '/api/audits', {
      body: {
        type: 'QUARTERLY',
        title: 'Q1 Library Operations Review — Jan to Mar 2026',
        periodStart: qStart,
        periodEnd: qEnd,
        academicYear: '2025-2026',
        observations: 'Quarterly review aggregating Jan, Feb, Mar 2026.',
      },
    });

    assert(
      createQuarterRes.status === 201,
      'Librarian can create test quarterly audit (HTTP 201)',
      `Got status ${createQuarterRes.status}`
    );
    const quarterlyAudit = createQuarterRes.body?.data;
    if (quarterlyAudit?.id) createdAuditIds.push(quarterlyAudit.id);

    // 12. Fetch quarterly report
    const quarterReportRes = await librarianClient.request('GET', `/api/audits/${quarterlyAudit.id}/report`);
    assert(
      quarterReportRes.status === 200,
      'Librarian can retrieve quarterly audit report (HTTP 200)',
      `Got status ${quarterReportRes.status}`
    );
    const qData = quarterReportRes.body?.data;

    // 13. Verify quarterly monthly breakdown
    assert(
      Array.isArray(qData?.quarterlyBreakdown),
      'Quarterly report contains quarterlyBreakdown array',
      `Got: ${typeof qData?.quarterlyBreakdown}`
    );
    assert(
      Array.isArray(qData?.topBorrowedTitles),
      'Quarterly report contains topBorrowedTitles array',
      `Got: ${typeof qData?.topBorrowedTitles}`
    );

    // =========================================================================
    // SECTION D: Snapshot Freezing & Immutability Verification
    // =========================================================================

    // 14. Advance monthly audit to IN_PROGRESS
    await librarianClient.request('PATCH', `/api/audits/${monthlyAudit.id}/status`, {
      body: { status: 'IN_PROGRESS' },
    });

    // 15. Compile and freeze snapshot
    const compileRes = await librarianClient.request('POST', `/api/audits/${monthlyAudit.id}/compile-snapshot`);
    assert(
      compileRes.status === 200,
      'Librarian can freeze audit snapshot via compile-snapshot (HTTP 200)',
      `Got status ${compileRes.status}`
    );
    assert(
      compileRes.body?.success === true,
      'Compile snapshot returns success: true',
      `Got: ${JSON.stringify(compileRes.body)}`
    );

    // 16. Advance audit to COMPLETED
    const completeRes = await librarianClient.request('PATCH', `/api/audits/${monthlyAudit.id}/status`, {
      body: { status: 'COMPLETED' },
    });
    assert(
      completeRes.status === 200,
      'Audit transitioned to COMPLETED status (HTTP 200)',
      `Got status ${completeRes.status}`
    );

    // 17. Verify that report is now served from frozen snapshot
    const frozenReportRes = await librarianClient.request('GET', `/api/audits/${monthlyAudit.id}/report`);
    assert(
      frozenReportRes.status === 200,
      'Retrieving completed audit report returns HTTP 200',
      `Got status ${frozenReportRes.status}`
    );
    assert(
      frozenReportRes.body?.isFrozenSnapshot === true,
      'Completed audit reports isFrozenSnapshot: true',
      `Got: ${frozenReportRes.body?.isFrozenSnapshot}`
    );

    const frozenTotalTitles = frozenReportRes.body?.data?.collection?.totalTitles;
    assert(
      typeof frozenTotalTitles === 'number',
      'Frozen snapshot preserves totalTitles metric',
      `Got: ${frozenTotalTitles}`
    );

    // 18. Immutability Drill: Add a new book to the database
    const laterBook = await dataManager.createBook({
      title: 'Subsequent Book - Post Audit Addition',
      category: 'GENERAL',
      copiesCount: 2,
    });

    // 19. Re-fetch the frozen audit report and verify totalTitles did NOT change
    const refetchedFrozenReport = await librarianClient.request('GET', `/api/audits/${monthlyAudit.id}/report`);
    assert(
      refetchedFrozenReport.body?.data?.collection?.totalTitles === frozenTotalTitles,
      'Completed audit snapshot is IMMUTABLE: totalTitles did not change despite database modification',
      `Expected ${frozenTotalTitles}, got ${refetchedFrozenReport.body?.data?.collection?.totalTitles}`
    );

    // 20. Close the audit
    const closeRes = await librarianClient.request('PATCH', `/api/audits/${monthlyAudit.id}/status`, {
      body: { status: 'CLOSED' },
    });
    assert(
      closeRes.status === 200,
      'Audit successfully CLOSED (HTTP 200)',
      `Got status ${closeRes.status}`
    );

    // 21. Attempting to compile snapshot on CLOSED audit is rejected
    const recompileClosedRes = await librarianClient.request('POST', `/api/audits/${monthlyAudit.id}/compile-snapshot`);
    assert(
      recompileClosedRes.status === 400,
      'Attempting to compile snapshot on CLOSED audit is rejected (HTTP 400)',
      `Got status ${recompileClosedRes.status}`
    );

    // 22. Verify administrative audit log for snapshot compilation
    const compileLog = await prisma.auditLog.findFirst({
      where: {
        action: 'LIBRARY_AUDIT_SNAPSHOT_COMPILED',
        targetId: monthlyAudit.id,
      },
    });
    assert(
      Boolean(compileLog),
      'LIBRARY_AUDIT_SNAPSHOT_COMPILED action logged in system AuditLog',
      'No AuditLog record found for snapshot compilation'
    );

  } finally {
    // Teardown created audits before dataManager cleanup
    if (createdAuditIds.length > 0) {
      await prisma.libraryAudit.deleteMany({
        where: { id: { in: createdAuditIds } },
      }).catch(() => {});
    }
    await dataManager.cleanup();
    await prisma.$disconnect();
  }
}
