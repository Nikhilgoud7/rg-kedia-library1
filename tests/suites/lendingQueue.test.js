// tests/suites/lendingQueue.test.js — Phase 5D Lending Requests & Issued Books Queue Hardening Suite
import { createApiClient, findLeakedSecrets } from '../helpers/apiClient.js';
import { TestDataManager } from '../helpers/testData.js';

export async function runLendingQueueTests(baseUrl, assert) {
  const dataManager = new TestDataManager();

  try {
    // ---------------------------------------------------------
    // 1. Setup Personas & Catalog
    // ---------------------------------------------------------
    const librarian = await dataManager.createLibrarian({ tag: 'lq_lib' });
    const librarianClient = createApiClient(baseUrl);
    librarianClient.loginAs(librarian);

    const student1 = await dataManager.createStudent({ tag: 'lq_stu1' });
    const student1Client = createApiClient(baseUrl);
    student1Client.loginAs(student1);

    const student2 = await dataManager.createStudent({ tag: 'lq_stu2' });

    const book1 = await dataManager.createBook({ title: 'Queue Management Book Alpha', totalCopies: 3 });
    const book2 = await dataManager.createBook({ title: 'Queue Management Book Beta', totalCopies: 2 });
    const book3 = await dataManager.createBook({ title: 'Queue Management Book Gamma', totalCopies: 2 });
    const book4 = await dataManager.createBook({ title: 'Queue Management Book Delta', totalCopies: 2 });

    // ---------------------------------------------------------
    // 2. Seed Active Lendings & Overdue Items
    // ---------------------------------------------------------
    const now = Date.now();
    const onTimeLending1 = await dataManager.createLending({
      userId: student1.id,
      bookCopyId: book1.copies[0].id,
      status: 'ISSUED',
      dueDate: new Date(now + 20 * 24 * 60 * 60 * 1000),
    });

    const onTimeLending2 = await dataManager.createLending({
      userId: student2.id,
      bookCopyId: book2.copies[0].id,
      status: 'ISSUED',
      dueDate: new Date(now + 15 * 24 * 60 * 60 * 1000),
    });

    const overdueLending = await dataManager.createLending({
      userId: student1.id,
      bookCopyId: book3.copies[0].id,
      status: 'ISSUED',
      dueDate: new Date(now - 7 * 24 * 60 * 60 * 1000), // 7 days overdue
    });

    // ---------------------------------------------------------
    // 3. GET /api/lending/all - Server-side Pagination & Limits
    // ---------------------------------------------------------
    const paginatedAllRes = await librarianClient.request('GET', '/api/lending/all?page=1&limit=2');
    assert(
      paginatedAllRes.status === 200,
      'GET /api/lending/all supports pagination parameters with HTTP 200',
      `Got status ${paginatedAllRes.status}`
    );
    assert(
      Array.isArray(paginatedAllRes.body?.lendings),
      'Response returns lendings array',
      `Array: ${Array.isArray(paginatedAllRes.body?.lendings)}`
    );
    assert(
      paginatedAllRes.body?.lendings?.length <= 2,
      'Page limit bounds result array to at most 2 items',
      `Length: ${paginatedAllRes.body?.lendings?.length}`
    );
    assert(
      paginatedAllRes.body?.pagination?.page === 1,
      'Pagination metadata accurately reflects page 1',
      `Page: ${paginatedAllRes.body?.pagination?.page}`
    );
    assert(
      paginatedAllRes.body?.pagination?.limit === 2,
      'Pagination metadata accurately reflects limit 2',
      `Limit: ${paginatedAllRes.body?.pagination?.limit}`
    );
    assert(
      typeof paginatedAllRes.body?.pagination?.total === 'number' && paginatedAllRes.body?.pagination?.total >= 3,
      'Pagination metadata accurately computes total matching loans',
      `Total: ${paginatedAllRes.body?.pagination?.total}`
    );
    assert(
      paginatedAllRes.body?.pagination?.totalPages >= 2,
      'Pagination metadata accurately computes totalPages',
      `TotalPages: ${paginatedAllRes.body?.pagination?.totalPages}`
    );

    // ---------------------------------------------------------
    // 4. GET /api/lending/all - Multi-Field Search & Overdue Filter
    // ---------------------------------------------------------
    // Search by student roll number
    const searchByRollRes = await librarianClient.request(
      'GET',
      `/api/lending/all?search=${encodeURIComponent(student1.rollNumber)}`
    );
    assert(
      searchByRollRes.status === 200,
      'GET /api/lending/all search by student roll number returns HTTP 200',
      `Got status ${searchByRollRes.status}`
    );
    const rollMatches = searchByRollRes.body?.lendings || [];
    assert(
      rollMatches.every((l) => l.user?.rollNumber === student1.rollNumber),
      'Search results strictly isolate matching student roll number',
      `Count: ${rollMatches.length}`
    );

    // Search by book title substring
    const searchByTitleRes = await librarianClient.request(
      'GET',
      `/api/lending/all?search=Queue%20Management%20Book%20Beta`
    );
    const titleMatches = searchByTitleRes.body?.lendings || [];
    assert(
      titleMatches.length >= 1 && titleMatches.every((l) => l.bookCopy?.book?.title?.includes('Book Beta')),
      'Search results isolate matching book title substring',
      `Matches: ${titleMatches.length}`
    );

    // Filter by overdueOnly
    const overdueRes = await librarianClient.request('GET', '/api/lending/all?overdueOnly=true');
    assert(
      overdueRes.status === 200,
      'GET /api/lending/all?overdueOnly=true returns HTTP 200',
      `Got status ${overdueRes.status}`
    );
    const overdueItems = overdueRes.body?.lendings || [];
    assert(
      overdueItems.length >= 1,
      'Overdue filter successfully returns overdue records',
      `Overdue count: ${overdueItems.length}`
    );
    assert(
      overdueItems.every((l) => new Date(l.dueDate) < new Date()),
      'Every record returned by overdueOnly filter has dueDate in the past',
      'All past due dates verified'
    );
    assert(
      overdueItems.every((l) => l.fine === 0),
      'Strict zero-monetary-fine policy confirmed (fine === 0 across all overdue items)',
      'All fines are 0'
    );

    // ---------------------------------------------------------
    // 5. GET /api/lending/requests - Pagination, Search & Status Filters
    // ---------------------------------------------------------
    const student3 = await dataManager.createStudent({ tag: 'lq_stu3' });

    const req1 = await dataManager.createBookRequest({
      userId: student3.id,
      bookId: book4.id,
      type: 'BORROW',
      status: 'PENDING',
      message: 'Need this book for upcoming exams',
    });

    const req2 = await dataManager.createBookRequest({
      userId: student2.id,
      bookId: book4.id,
      type: 'BORROW',
      status: 'PENDING',
      message: 'Research reference',
    });

    const requestsPageRes = await librarianClient.request('GET', '/api/lending/requests?status=PENDING&page=1&limit=1');
    assert(
      requestsPageRes.status === 200,
      'GET /api/lending/requests with pagination returns HTTP 200',
      `Got status ${requestsPageRes.status}`
    );
    assert(
      requestsPageRes.body?.requests?.length === 1,
      'Page limit accurately restricts returned requests to 1',
      `Length: ${requestsPageRes.body?.requests?.length}`
    );
    assert(
      requestsPageRes.body?.pagination?.total >= 2,
      'Total requests accurately calculated in pagination metadata',
      `Total: ${requestsPageRes.body?.pagination?.total}`
    );

    // Search requests by borrower name
    const searchReqRes = await librarianClient.request(
      'GET',
      `/api/lending/requests?search=${encodeURIComponent(student3.name)}`
    );
    const matchedRequests = searchReqRes.body?.requests || [];
    assert(
      matchedRequests.length >= 1 && matchedRequests.every((r) => r.user?.name === student3.name),
      'Requests queue search isolates applicant name',
      `Matches: ${matchedRequests.length}`
    );

    // ---------------------------------------------------------
    // 6. Transactional AuditLog on Lending Approval
    // ---------------------------------------------------------
    const initialApprovedLogs = await dataManager.prisma.auditLog.count({
      where: { action: 'LENDING_APPROVED' },
    });

    const approveRes = await librarianClient.request('POST', `/api/lending/approve/${req1.id}`, {
      body: { daysToReturn: 28 },
    });

    assert(
      approveRes.status === 200,
      'POST /api/lending/approve/:requestId succeeds with HTTP 200',
      `Got status ${approveRes.status}`
    );
    const approvedLendingId = approveRes.body?.lending?.id;
    assert(
      !!approvedLendingId,
      'Approval response returns created lending id',
      `ID: ${approvedLendingId}`
    );
    if (approvedLendingId) {
      dataManager.createdLendingIds.add(approvedLendingId);
    }

    const approvalAudit = await dataManager.prisma.auditLog.findFirst({
      where: {
        action: 'LENDING_APPROVED',
        targetId: approvedLendingId,
      },
    });

    assert(
      !!approvalAudit,
      'AuditLog recorded LENDING_APPROVED within transaction',
      `Found: ${!!approvalAudit}`
    );
    assert(
      approvalAudit?.actorId === librarian.id,
      'LENDING_APPROVED AuditLog records librarian actorId',
      `Expected ${librarian.id}, got ${approvalAudit?.actorId}`
    );
    const auditDetails = typeof approvalAudit?.details === 'string'
      ? JSON.parse(approvalAudit.details)
      : approvalAudit?.details;
    assert(
      auditDetails?.daysToReturn === 28,
      'LENDING_APPROVED AuditLog captures custom loan duration details',
      `Days: ${auditDetails?.daysToReturn}`
    );

    // Concurrency / Duplicate Approval Rejection
    const duplicateApproveRes = await librarianClient.request('POST', `/api/lending/approve/${req1.id}`);
    assert(
      duplicateApproveRes.status === 409,
      'Second approval of same request is rejected with HTTP 409',
      `Got status ${duplicateApproveRes.status}`
    );

    // ---------------------------------------------------------
    // 7. Transactional AuditLog on Lending Rejection
    // ---------------------------------------------------------
    const rejectRes = await librarianClient.request('POST', `/api/lending/reject/${req2.id}`, {
      body: { reason: 'Semester loan allocation currently filled.' },
    });

    assert(
      rejectRes.status === 200,
      'POST /api/lending/reject/:requestId succeeds with HTTP 200',
      `Got status ${rejectRes.status}`
    );

    const rejectAudit = await dataManager.prisma.auditLog.findFirst({
      where: {
        action: 'LENDING_REJECTED',
        targetId: req2.id,
      },
    });

    assert(
      !!rejectAudit,
      'AuditLog recorded LENDING_REJECTED within transaction',
      `Found: ${!!rejectAudit}`
    );
    assert(
      rejectAudit?.actorId === librarian.id,
      'LENDING_REJECTED AuditLog records librarian actorId',
      `Expected ${librarian.id}, got ${rejectAudit?.actorId}`
    );
    const rejectDetails = typeof rejectAudit?.details === 'string'
      ? JSON.parse(rejectAudit.details)
      : rejectAudit?.details;
    assert(
      rejectDetails?.reason?.includes('Semester loan allocation'),
      'LENDING_REJECTED AuditLog captures rejection reason note',
      `Reason: ${rejectDetails?.reason}`
    );

    // ---------------------------------------------------------
    // 8. Transactional AuditLog on Book Return
    // ---------------------------------------------------------
    const returnRes = await librarianClient.request('POST', `/api/lending/return/${onTimeLending1.id}`);
    assert(
      returnRes.status === 200,
      'POST /api/lending/return/:lendingId succeeds with HTTP 200',
      `Got status ${returnRes.status}`
    );
    assert(
      returnRes.body?.fine === 0,
      'Return response confirms fine is 0 (zero monetary fine policy)',
      `Fine: ${returnRes.body?.fine}`
    );

    const returnAudit = await dataManager.prisma.auditLog.findFirst({
      where: {
        action: 'LENDING_RETURNED',
        targetId: onTimeLending1.id,
      },
    });

    assert(
      !!returnAudit,
      'AuditLog recorded LENDING_RETURNED within transaction',
      `Found: ${!!returnAudit}`
    );
    assert(
      returnAudit?.actorId === librarian.id,
      'LENDING_RETURNED AuditLog records librarian actorId',
      `Expected ${librarian.id}, got ${returnAudit?.actorId}`
    );
    const returnDetails = typeof returnAudit?.details === 'string'
      ? JSON.parse(returnAudit.details)
      : returnAudit?.details;
    assert(
      returnDetails?.fine === 0,
      'LENDING_RETURNED AuditLog explicitly logs fine: 0',
      `Fine logged: ${returnDetails?.fine}`
    );

    // Duplicate Return Rejection
    const duplicateReturnRes = await librarianClient.request('POST', `/api/lending/return/${onTimeLending1.id}`);
    assert(
      duplicateReturnRes.status === 409,
      'Duplicate return attempt on already returned book is rejected with HTTP 409',
      `Got status ${duplicateReturnRes.status}`
    );

    // ---------------------------------------------------------
    // 9. Role Authorization Restrictions (HTTP 403)
    // ---------------------------------------------------------
    const stuApprove = await student1Client.request('POST', `/api/lending/approve/${req1.id}`);
    assert(
      stuApprove.status === 403,
      'Student is forbidden from POST /api/lending/approve/:id (HTTP 403)',
      `Got status ${stuApprove.status}`
    );

    const stuReject = await student1Client.request('POST', `/api/lending/reject/${req2.id}`);
    assert(
      stuReject.status === 403,
      'Student is forbidden from POST /api/lending/reject/:id (HTTP 403)',
      `Got status ${stuReject.status}`
    );

    const stuReturn = await student1Client.request('POST', `/api/lending/return/${onTimeLending2.id}`);
    assert(
      stuReturn.status === 403,
      'Student is forbidden from POST /api/lending/return/:id (HTTP 403)',
      `Got status ${stuReturn.status}`
    );

    const stuRequests = await student1Client.request('GET', '/api/lending/requests');
    assert(
      stuRequests.status === 403,
      'Student is forbidden from GET /api/lending/requests (HTTP 403)',
      `Got status ${stuRequests.status}`
    );

    // ---------------------------------------------------------
    // 10. Zero Sensitive Credentials Leak Scan
    // ---------------------------------------------------------
    const leakedInAll = findLeakedSecrets(paginatedAllRes.body);
    assert(
      leakedInAll.length === 0,
      'Zero sensitive security keys leaked in GET /api/lending/all payload',
      `Leaks: ${leakedInAll.join(', ') || 'none'}`
    );

    const leakedInRequests = findLeakedSecrets(requestsPageRes.body);
    assert(
      leakedInRequests.length === 0,
      'Zero sensitive security keys leaked in GET /api/lending/requests payload',
      `Leaks: ${leakedInRequests.join(', ') || 'none'}`
    );

  } finally {
    await dataManager.cleanup();
  }
}
