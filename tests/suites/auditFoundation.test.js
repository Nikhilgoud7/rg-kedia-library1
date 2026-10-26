// tests/suites/auditFoundation.test.js — Phase 11A Audit Dashboard & Management Foundation Test Suite
import { PrismaClient } from '@prisma/client';
import { createApiClient } from '../helpers/apiClient.js';
import { TestDataManager } from '../helpers/testData.js';

export async function runAuditFoundationTests(baseUrl, assert) {
  const prisma = new PrismaClient();
  const dataManager = new TestDataManager();
  let createdAudit;

  try {
    // -------------------------------------------------------------------------
    // Setup Test Personas
    // -------------------------------------------------------------------------
    const student = await dataManager.createStudent({ tag: 'aud_stu' });
    const teacher = await dataManager.createTeacher({ tag: 'aud_tea' });
    const librarian = await dataManager.createLibrarian({ tag: 'aud_lib' });

    const anonClient = createApiClient(baseUrl);
    const studentClient = createApiClient(baseUrl);
    const teacherClient = createApiClient(baseUrl);
    const librarianClient = createApiClient(baseUrl);

    studentClient.loginAs(student);
    teacherClient.loginAs(teacher);
    librarianClient.loginAs(librarian);

    // =========================================================================
    // SECTION A: Strict Role-Based Access Control
    // =========================================================================

    // 1. Unauthenticated request to /api/audits is rejected
    const unauthAudits = await anonClient.request('GET', '/api/audits');
    assert(
      unauthAudits.status === 401,
      'Unauthenticated request to /api/audits is rejected (HTTP 401)',
      `Got status ${unauthAudits.status}`
    );

    // 2. Unauthenticated request to /api/audits/summary/dashboard is rejected
    const unauthDashboard = await anonClient.request('GET', '/api/audits/summary/dashboard');
    assert(
      unauthDashboard.status === 401,
      'Unauthenticated request to /api/audits/summary/dashboard is rejected (HTTP 401)',
      `Got status ${unauthDashboard.status}`
    );

    // 3. STUDENT role rejected from /api/audits
    const studentAudits = await studentClient.request('GET', '/api/audits');
    assert(
      studentAudits.status === 403,
      'STUDENT role is rejected from /api/audits (HTTP 403)',
      `Got status ${studentAudits.status}`
    );

    // 4. STUDENT role rejected from /api/audits/summary/dashboard
    const studentDashboard = await studentClient.request('GET', '/api/audits/summary/dashboard');
    assert(
      studentDashboard.status === 403,
      'STUDENT role is rejected from /api/audits/summary/dashboard (HTTP 403)',
      `Got status ${studentDashboard.status}`
    );

    // 5. TEACHER role rejected from /api/audits
    const teacherAudits = await teacherClient.request('GET', '/api/audits');
    assert(
      teacherAudits.status === 403,
      'TEACHER role is rejected from /api/audits (HTTP 403)',
      `Got status ${teacherAudits.status}`
    );

    // 6. TEACHER role rejected from /api/audits/summary/dashboard
    const teacherDashboard = await teacherClient.request('GET', '/api/audits/summary/dashboard');
    assert(
      teacherDashboard.status === 403,
      'TEACHER role is rejected from /api/audits/summary/dashboard (HTTP 403)',
      `Got status ${teacherDashboard.status}`
    );

    // 7. LIBRARIAN role can access /api/audits
    const libAudits = await librarianClient.request('GET', '/api/audits');
    assert(
      libAudits.status === 200,
      'LIBRARIAN role can access /api/audits (HTTP 200)',
      `Got status ${libAudits.status}`
    );
    assert(
      libAudits.body?.success === true,
      'Audit list response returns success: true',
      `Got: ${JSON.stringify(libAudits.body)}`
    );

    // 8. LIBRARIAN role can access /api/audits/summary/dashboard
    const libDashboard = await librarianClient.request('GET', '/api/audits/summary/dashboard');
    assert(
      libDashboard.status === 200,
      'LIBRARIAN role can access /api/audits/summary/dashboard (HTTP 200)',
      `Got status ${libDashboard.status}`
    );
    assert(
      libDashboard.body?.success === true,
      'Audit dashboard response returns success: true',
      `Got: ${JSON.stringify(libDashboard.body)}`
    );
    assert(
      typeof libDashboard.body?.data?.totalAudits === 'number',
      'Dashboard metrics include totalAudits count',
      `Got: ${libDashboard.body?.data?.totalAudits}`
    );

    // =========================================================================
    // SECTION B: Input Validation & Audit Creation
    // =========================================================================

    // 9. STUDENT cannot POST new audit
    const studentCreate = await studentClient.request('POST', '/api/audits', {
      body: {
        type: 'MONTHLY',
        title: 'Hacked Audit',
        periodStart: '2026-10-01',
        periodEnd: '2026-10-31',
      },
    });
    assert(
      studentCreate.status === 403,
      'STUDENT role is rejected from creating audits (HTTP 403)',
      `Got status ${studentCreate.status}`
    );

    // 10. Creation with missing fields rejected
    const missingFieldsRes = await librarianClient.request('POST', '/api/audits', {
      body: {
        type: 'MONTHLY',
        // missing title, periodStart, periodEnd
      },
    });
    assert(
      missingFieldsRes.status === 400,
      'Audit creation with missing fields is rejected (HTTP 400)',
      `Got status ${missingFieldsRes.status}`
    );

    // 11. Creation with invalid audit type rejected
    const invalidTypeRes = await librarianClient.request('POST', '/api/audits', {
      body: {
        type: 'INVALID_TYPE',
        title: 'Invalid Audit',
        periodStart: '2026-10-01',
        periodEnd: '2026-10-31',
      },
    });
    assert(
      invalidTypeRes.status === 400,
      'Audit creation with invalid type is rejected (HTTP 400)',
      `Got status ${invalidTypeRes.status}`
    );

    // 12. Creation with inverted date range rejected
    const invertedDatesRes = await librarianClient.request('POST', '/api/audits', {
      body: {
        type: 'MONTHLY',
        title: 'Inverted Audit',
        periodStart: '2026-10-31',
        periodEnd: '2026-10-01',
      },
    });
    assert(
      invertedDatesRes.status === 400,
      'Audit creation with periodStart > periodEnd is rejected (HTTP 400)',
      `Got status ${invertedDatesRes.status}`
    );

    // 13. Successful creation of Monthly Audit
    const testMonthStart = '2026-10-01';
    const testMonthEnd = '2026-10-31';
    const validAuditRes = await librarianClient.request('POST', '/api/audits', {
      body: {
        type: 'MONTHLY',
        title: 'Test Monthly Library Operations Audit — October 2026',
        periodStart: testMonthStart,
        periodEnd: testMonthEnd,
        academicYear: '2026-2027',
        observations: 'Initial baseline operational review for October 2026.',
      },
    });

    assert(
      validAuditRes.status === 201,
      'Librarian can successfully initiate an audit engagement (HTTP 201)',
      `Got status ${validAuditRes.status}, body: ${JSON.stringify(validAuditRes.body)}`
    );
    assert(
      validAuditRes.body?.success === true,
      'Creation response contains success: true',
      `Got: ${JSON.stringify(validAuditRes.body)}`
    );

    createdAudit = validAuditRes.body?.data;
    assert(
      Boolean(createdAudit?.id),
      'Created audit returns a valid unique ID',
      `Got id: ${createdAudit?.id}`
    );
    assert(
      /^AUD-2026-M10-\d{3}$/.test(createdAudit?.auditNumber || ''),
      'Created monthly audit generates standardized identifier AUD-2026-M10-XXX',
      `Got auditNumber: ${createdAudit?.auditNumber}`
    );
    assert(
      createdAudit?.status === 'NOT_STARTED',
      'Newly initiated audit defaults to NOT_STARTED status',
      `Got status: ${createdAudit?.status}`
    );
    assert(
      createdAudit?.leadLibrarian?.name === librarian.name,
      'Created audit correctly links responsible lead librarian',
      `Expected ${librarian.name}, got ${createdAudit?.leadLibrarian?.name}`
    );

    // 14. Duplicate Audit Prevention
    const duplicateRes = await librarianClient.request('POST', '/api/audits', {
      body: {
        type: 'MONTHLY',
        title: 'Duplicate Monthly Audit Attempt',
        periodStart: testMonthStart,
        periodEnd: testMonthEnd,
      },
    });
    assert(
      duplicateRes.status === 409,
      'Attempting to create duplicate active audit for identical period is rejected (HTTP 409)',
      `Got status ${duplicateRes.status}`
    );

    // =========================================================================
    // SECTION C: Audit Retrieval & Filtering
    // =========================================================================

    // 15. Retrieve audit by ID
    const getByIdRes = await librarianClient.request('GET', `/api/audits/${createdAudit.id}`);
    assert(
      getByIdRes.status === 200,
      'Librarian can retrieve audit detail by ID (HTTP 200)',
      `Got status ${getByIdRes.status}`
    );
    assert(
      getByIdRes.body?.data?.id === createdAudit.id,
      'Retrieved audit ID matches requested ID',
      `Got: ${getByIdRes.body?.data?.id}`
    );
    assert(
      getByIdRes.body?.data?.auditNumber === createdAudit.auditNumber,
      'Retrieved audit number matches created audit number',
      `Got: ${getByIdRes.body?.data?.auditNumber}`
    );

    // 16. Non-existent audit ID returns 404
    const notFoundRes = await librarianClient.request('GET', '/api/audits/00000000-0000-0000-0000-000000000000');
    assert(
      notFoundRes.status === 404,
      'Non-existent audit ID returns HTTP 404',
      `Got status ${notFoundRes.status}`
    );

    // 17. Filter audits by type
    const filterTypeRes = await librarianClient.request('GET', '/api/audits?type=MONTHLY');
    assert(
      filterTypeRes.status === 200,
      'Filter audits by type=MONTHLY returns HTTP 200',
      `Got status ${filterTypeRes.status}`
    );
    const monthlyList = filterTypeRes.body?.data || [];
    assert(
      monthlyList.every((a) => a.type === 'MONTHLY'),
      'All returned audits in type=MONTHLY query match MONTHLY type',
      `Found unexpected types in list`
    );

    // 18. Filter audits by status
    const filterStatusRes = await librarianClient.request('GET', '/api/audits?status=NOT_STARTED');
    assert(
      filterStatusRes.status === 200,
      'Filter audits by status=NOT_STARTED returns HTTP 200',
      `Got status ${filterStatusRes.status}`
    );

    // =========================================================================
    // SECTION D: Lifecycle State Machine Transitions
    // =========================================================================

    // 19. Invalid skip transition (NOT_STARTED -> COMPLETED) is rejected
    const invalidSkipRes = await librarianClient.request('PATCH', `/api/audits/${createdAudit.id}/status`, {
      body: {
        status: 'COMPLETED',
      },
    });
    assert(
      invalidSkipRes.status === 400,
      'Invalid state transition from NOT_STARTED directly to COMPLETED is rejected (HTTP 400)',
      `Got status ${invalidSkipRes.status}`
    );

    // 20. Valid transition: NOT_STARTED -> IN_PROGRESS
    const startRes = await librarianClient.request('PATCH', `/api/audits/${createdAudit.id}/status`, {
      body: {
        status: 'IN_PROGRESS',
      },
    });
    assert(
      startRes.status === 200,
      'Valid transition from NOT_STARTED to IN_PROGRESS succeeds (HTTP 200)',
      `Got status ${startRes.status}`
    );
    assert(
      startRes.body?.data?.status === 'IN_PROGRESS',
      'Audit status updated to IN_PROGRESS',
      `Got: ${startRes.body?.data?.status}`
    );

    // 21. Valid transition: IN_PROGRESS -> PENDING_RECONCILIATION
    const pendingRes = await librarianClient.request('PATCH', `/api/audits/${createdAudit.id}/status`, {
      body: {
        status: 'PENDING_RECONCILIATION',
        observations: 'Physical shelf counts underway; awaiting reconciliation.',
      },
    });
    assert(
      pendingRes.status === 200,
      'Valid transition from IN_PROGRESS to PENDING_RECONCILIATION succeeds (HTTP 200)',
      `Got status ${pendingRes.status}`
    );
    assert(
      pendingRes.body?.data?.status === 'PENDING_RECONCILIATION',
      'Audit status updated to PENDING_RECONCILIATION',
      `Got: ${pendingRes.body?.data?.status}`
    );

    // 22. Valid transition: PENDING_RECONCILIATION -> COMPLETED
    const completeRes = await librarianClient.request('PATCH', `/api/audits/${createdAudit.id}/status`, {
      body: {
        status: 'COMPLETED',
        recommendations: 'Recommended adding 10 additional copies of Financial Accounting.',
        snapshotData: {
          totalBooks: 45,
          totalCopies: 120,
          available: 110,
          issued: 10,
          verifiedAt: new Date().toISOString(),
        },
      },
    });
    assert(
      completeRes.status === 200,
      'Valid transition from PENDING_RECONCILIATION to COMPLETED succeeds (HTTP 200)',
      `Got status ${completeRes.status}`
    );
    assert(
      completeRes.body?.data?.status === 'COMPLETED',
      'Audit status updated to COMPLETED',
      `Got: ${completeRes.body?.data?.status}`
    );
    assert(
      Boolean(completeRes.body?.data?.completedAt),
      'Completion timestamp completedAt is recorded',
      `Got completedAt: ${completeRes.body?.data?.completedAt}`
    );

    // 23. Valid transition: COMPLETED -> CLOSED
    const closeRes = await librarianClient.request('PATCH', `/api/audits/${createdAudit.id}/status`, {
      body: {
        status: 'CLOSED',
      },
    });
    assert(
      closeRes.status === 200,
      'Valid transition from COMPLETED to CLOSED succeeds (HTTP 200)',
      `Got status ${closeRes.status}`
    );
    assert(
      closeRes.body?.data?.status === 'CLOSED',
      'Audit status updated to CLOSED',
      `Got: ${closeRes.body?.data?.status}`
    );
    assert(
      Boolean(closeRes.body?.data?.closedAt),
      'Closure timestamp closedAt is recorded',
      `Got closedAt: ${closeRes.body?.data?.closedAt}`
    );

    // 24. Attempt to alter CLOSED audit is strictly rejected
    const alterClosedRes = await librarianClient.request('PATCH', `/api/audits/${createdAudit.id}/status`, {
      body: {
        status: 'IN_PROGRESS',
      },
    });
    assert(
      alterClosedRes.status === 400,
      'Attempting to alter a CLOSED audit is rejected (HTTP 400)',
      `Got status ${alterClosedRes.status}`
    );

    // 25. Attempt to update notes on CLOSED audit is rejected
    const updateNotesRes = await librarianClient.request('PATCH', `/api/audits/${createdAudit.id}/notes`, {
      body: {
        observations: 'Attempting post-closure alteration',
      },
    });
    assert(
      updateNotesRes.status === 400,
      'Attempting to update notes on a CLOSED audit is rejected (HTTP 400)',
      `Got status ${updateNotesRes.status}`
    );

    // =========================================================================
    // SECTION E: Administrative Audit Trail Verification
    // =========================================================================

    // 26. Verify AuditLog entries created for library audit actions
    const creationLog = await prisma.auditLog.findFirst({
      where: {
        action: 'LIBRARY_AUDIT_CREATED',
        targetId: createdAudit.id,
      },
    });
    assert(
      Boolean(creationLog),
      'LIBRARY_AUDIT_CREATED action logged in system AuditLog',
      'No AuditLog record found for LIBRARY_AUDIT_CREATED'
    );

    const statusLog = await prisma.auditLog.findFirst({
      where: {
        action: 'LIBRARY_AUDIT_STATUS_UPDATED',
        targetId: createdAudit.id,
      },
      orderBy: { timestamp: 'desc' },
    });
    assert(
      Boolean(statusLog),
      'LIBRARY_AUDIT_STATUS_UPDATED action logged in system AuditLog',
      'No AuditLog record found for LIBRARY_AUDIT_STATUS_UPDATED'
    );

  } finally {
    if (createdAudit?.id) {
      await prisma.libraryAudit.deleteMany({
        where: { id: createdAudit.id },
      }).catch(() => {});
    }
    await dataManager.cleanup();
    await prisma.$disconnect();
  }
}
