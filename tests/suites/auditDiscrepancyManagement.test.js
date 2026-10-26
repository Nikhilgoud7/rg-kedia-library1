// tests/suites/auditDiscrepancyManagement.test.js — Phase 11D Discrepancy & Corrective Action Management Test Suite
import { PrismaClient } from '@prisma/client';
import { createApiClient } from '../helpers/apiClient.js';
import { TestDataManager } from '../helpers/testData.js';

export async function runAuditDiscrepancyManagementTests(baseUrl, assert) {
  const prisma = new PrismaClient();
  const dataManager = new TestDataManager();
  const createdAuditIds = [];

  try {
    // -------------------------------------------------------------------------
    // Setup Test Personas & Test Data
    // -------------------------------------------------------------------------
    const student = await dataManager.createStudent({ tag: 'disc_stu' });
    const teacher = await dataManager.createTeacher({ tag: 'disc_tea' });
    const librarian = await dataManager.createLibrarian({ tag: 'disc_lib' });

    const anonClient = createApiClient(baseUrl);
    const studentClient = createApiClient(baseUrl);
    const teacherClient = createApiClient(baseUrl);
    const librarianClient = createApiClient(baseUrl);

    studentClient.loginAs(student);
    teacherClient.loginAs(teacher);
    librarianClient.loginAs(librarian);

    const book = await dataManager.createBook({
      title: 'Mercantile Law and Corporate Regulations',
      category: 'TEXTBOOK',
      totalCopies: 2,
    });

    const copy = await prisma.bookCopy.findFirst({
      where: { bookId: book.id },
    });

    // Create an audit engagement for testing discrepancies
    const createAuditRes = await librarianClient.request('POST', '/api/audits', {
      body: {
        type: 'MONTHLY',
        title: 'Monthly Operations & Quality Audit — April 2026',
        periodStart: '2026-04-01',
        periodEnd: '2026-04-30',
        academicYear: '2025-2026',
      },
    });

    assert(createAuditRes.status === 201, 'Librarian creates test audit', `Got status ${createAuditRes.status}`);
    const audit = createAuditRes.body.data;
    createdAuditIds.push(audit.id);

    // =========================================================================
    // SECTION A: Authorization & RBAC Validation
    // =========================================================================
    const anonRes = await anonClient.request('GET', `/api/audits/${audit.id}/discrepancies`);
    assert(anonRes.status === 401, 'Anonymous user rejected from discrepancies (HTTP 401)', `Got status ${anonRes.status}`);

    const stuRes = await studentClient.request('GET', `/api/audits/${audit.id}/discrepancies`);
    assert(stuRes.status === 403, 'Student rejected from discrepancies (HTTP 403)', `Got status ${stuRes.status}`);

    const teaRes = await teacherClient.request('GET', `/api/audits/${audit.id}/discrepancies`);
    assert(teaRes.status === 403, 'Teacher rejected from discrepancies (HTTP 403)', `Got status ${teaRes.status}`);

    // =========================================================================
    // SECTION B: Manual Discrepancy Creation
    // =========================================================================
    const createDiscRes = await librarianClient.request('POST', `/api/audits/${audit.id}/discrepancies`, {
      body: {
        bookId: book.id,
        bookCopyId: copy?.id,
        barcode: copy?.barcode || 'BC-LAW-001',
        category: 'DAMAGED_BOOK',
        severity: 'HIGH',
        description: 'Physical binding detached; missing final chapter pages.',
      },
    });

    assert(createDiscRes.status === 201, 'Librarian can log discrepancy (HTTP 201)', `Got status ${createDiscRes.status}`);
    const discrepancy = createDiscRes.body.data;
    assert(discrepancy.category === 'DAMAGED_BOOK', 'Category correctly recorded');
    assert(discrepancy.severity === 'HIGH', 'Severity correctly recorded');
    assert(discrepancy.status === 'OPEN', 'Initial status defaults to OPEN');

    // =========================================================================
    // SECTION C: Querying & Filtering Discrepancies
    // =========================================================================
    const listRes = await librarianClient.request('GET', `/api/audits/${audit.id}/discrepancies?category=DAMAGED_BOOK`);
    assert(listRes.status === 200, 'Librarian can list audit discrepancies (HTTP 200)', `Got status ${listRes.status}`);
    assert(listRes.body.data.length >= 1, 'Filtered list returns created discrepancy');
    assert(listRes.body.data[0].id === discrepancy.id, 'Discrepancy ID matches');

    // Test cross-audit global query
    const allDiscrepanciesRes = await librarianClient.request('GET', '/api/audits/discrepancies/all?status=OPEN');
    assert(allDiscrepanciesRes.status === 200, 'Global discrepancy query succeeds (HTTP 200)', `Got status ${allDiscrepanciesRes.status}`);
    assert(Array.isArray(allDiscrepanciesRes.body.data), 'Returns data array');

    // Test single discrepancy lookup
    const singleDiscRes = await librarianClient.request('GET', `/api/audits/discrepancies/${discrepancy.id}`);
    assert(singleDiscRes.status === 200, 'Retrieve single discrepancy (HTTP 200)', `Got status ${singleDiscRes.status}`);
    assert(singleDiscRes.body.data.id === discrepancy.id, 'Returned correct discrepancy');
    assert(Array.isArray(singleDiscRes.body.data.correctiveActions), 'Includes correctiveActions array');

    // =========================================================================
    // SECTION D: Corrective Action Logging & State Machine Workflow
    // =========================================================================

    // 1. Move OPEN -> UNDER_INVESTIGATION
    const action1Res = await librarianClient.request('POST', `/api/audits/discrepancies/${discrepancy.id}/actions`, {
      body: {
        actionTaken: 'Inspected physical copy in repair repository. Assigned to binder.',
        resultingStatus: 'UNDER_INVESTIGATION',
        notes: 'Sent to bindery department for quote.',
      },
    });

    assert(action1Res.status === 201, 'Log corrective action (HTTP 201)', `Got status ${action1Res.status}`);
    assert(action1Res.body.data.discrepancy.status === 'UNDER_INVESTIGATION', 'Discrepancy status transitioned to UNDER_INVESTIGATION');

    // 2. Test Invalid Status Transition Rejection (e.g., from UNDER_INVESTIGATION to OPEN is not in allowed list)
    const invalidTransitionRes = await librarianClient.request('POST', `/api/audits/discrepancies/${discrepancy.id}/actions`, {
      body: {
        actionTaken: 'Attempting invalid reverse transition.',
        resultingStatus: 'OPEN',
      },
    });
    assert(
      invalidTransitionRes.status === 400,
      'Invalid status transition rejected (HTTP 400)',
      `Got status ${invalidTransitionRes.status}`
    );

    // 3. Move UNDER_INVESTIGATION -> RESOLVED
    const action2Res = await librarianClient.request('POST', `/api/audits/discrepancies/${discrepancy.id}/actions`, {
      body: {
        actionTaken: 'Book successfully rebound by Osmania University Press binder and returned to circulation.',
        resultingStatus: 'RESOLVED',
        notes: 'Restored to shelf location.',
      },
    });

    assert(action2Res.status === 201, 'Discrepancy transitioned to RESOLVED (HTTP 201)', `Got status ${action2Res.status}`);
    assert(action2Res.body.data.discrepancy.status === 'RESOLVED', 'Status is RESOLVED');
    assert(Boolean(action2Res.body.data.discrepancy.resolvedAt), 'resolvedAt timestamp automatically populated');

    // 4. Move RESOLVED -> CLOSED (Terminal locked state)
    const action3Res = await librarianClient.request('POST', `/api/audits/discrepancies/${discrepancy.id}/actions`, {
      body: {
        actionTaken: 'Final institutional audit sign-off. Discrepancy case verified and closed.',
        resultingStatus: 'CLOSED',
        notes: 'Formally closed by lead librarian.',
      },
    });

    assert(action3Res.status === 201, 'Discrepancy transitioned to CLOSED (HTTP 201)', `Got status ${action3Res.status}`);
    assert(action3Res.body.data.discrepancy.status === 'CLOSED', 'Status is CLOSED');

    // 5. Immutability Enforcement: Attempting to modify CLOSED discrepancy is strictly rejected
    const immutableAttemptRes = await librarianClient.request('POST', `/api/audits/discrepancies/${discrepancy.id}/actions`, {
      body: {
        actionTaken: 'Attempting to append notes on locked discrepancy.',
        resultingStatus: 'UNDER_INVESTIGATION',
      },
    });

    assert(
      immutableAttemptRes.status === 400,
      'Modifying CLOSED discrepancy is rejected as immutable (HTTP 400)',
      `Got status ${immutableAttemptRes.status}`
    );
    assert(
      immutableAttemptRes.body.error && immutableAttemptRes.body.error.includes('immutable'),
      'Clear immutability rejection message returned'
    );

    // =========================================================================
    // SECTION E: Cannot Log Discrepancies on CLOSED Audit
    // =========================================================================
    // Advance test audit according to state machine: NOT_STARTED -> IN_PROGRESS -> COMPLETED -> CLOSED
    await librarianClient.request('PATCH', `/api/audits/${audit.id}/status`, { body: { status: 'IN_PROGRESS' } });
    await librarianClient.request('PATCH', `/api/audits/${audit.id}/status`, { body: { status: 'COMPLETED' } });
    await librarianClient.request('PATCH', `/api/audits/${audit.id}/status`, { body: { status: 'CLOSED' } });

    const postClosedRes = await librarianClient.request('POST', `/api/audits/${audit.id}/discrepancies`, {
      body: {
        category: 'OTHER',
        description: 'Attempt to add discrepancy to closed engagement.',
      },
    });

    assert(
      postClosedRes.status === 400,
      'Adding discrepancy to CLOSED audit is rejected (HTTP 400)',
      `Got status ${postClosedRes.status}`
    );

  } finally {
    if (createdAuditIds.length > 0) {
      await prisma.libraryAudit.deleteMany({
        where: { id: { in: createdAuditIds } },
      }).catch(() => {});
    }
    await dataManager.cleanup();
    await prisma.$disconnect();
  }
}
