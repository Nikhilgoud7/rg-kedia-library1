// tests/suites/librarianPolish.test.js — Phase 5F Librarian UX Polish, Audit Trail & Gate 2 Hardening Suite
import { createApiClient, findLeakedSecrets } from '../helpers/apiClient.js';
import { TestDataManager } from '../helpers/testData.js';

export async function runLibrarianPolishTests(baseUrl, assert) {
  const dataManager = new TestDataManager();

  try {
    // ---------------------------------------------------------
    // 1. Setup Personas
    // ---------------------------------------------------------
    const librarian = await dataManager.createLibrarian({ tag: 'pol_lib' });
    const librarianClient = createApiClient(baseUrl);
    librarianClient.loginAs(librarian);

    const teacher = await dataManager.createTeacher({ tag: 'pol_tch' });
    const teacherClient = createApiClient(baseUrl);
    teacherClient.loginAs(teacher);

    const student = await dataManager.createStudent({ tag: 'pol_stu' });
    const studentClient = createApiClient(baseUrl);
    studentClient.loginAs(student);

    const unauthClient = createApiClient(baseUrl);

    // ---------------------------------------------------------
    // 2. Audit Logs Access Control
    // ---------------------------------------------------------
    // A. Unauthenticated access -> 401
    const unauthAuditRes = await unauthClient.request('GET', '/api/admin/audit-logs');
    assert(
      unauthAuditRes.status === 401,
      'Unauthenticated user cannot access audit logs (HTTP 401)',
      `Got status ${unauthAuditRes.status}`
    );

    // B. Student access -> 403
    const studentAuditRes = await studentClient.request('GET', '/api/admin/audit-logs');
    assert(
      studentAuditRes.status === 403,
      'Student is forbidden from accessing audit logs (HTTP 403)',
      `Got status ${studentAuditRes.status}`
    );

    // C. Teacher access -> 403
    const teacherAuditRes = await teacherClient.request('GET', '/api/admin/audit-logs');
    assert(
      teacherAuditRes.status === 403,
      'Teacher is forbidden from accessing audit logs (HTTP 403)',
      `Got status ${teacherAuditRes.status}`
    );

    // D. Librarian access -> 200
    const librarianAuditRes = await librarianClient.request('GET', '/api/admin/audit-logs');
    assert(
      librarianAuditRes.status === 200,
      'Librarian can access audit logs with HTTP 200',
      `Got status ${librarianAuditRes.status}`
    );
    assert(
      Array.isArray(librarianAuditRes.data.logs),
      'GET /api/admin/audit-logs returns array of logs under data.logs'
    );
    assert(
      Boolean(librarianAuditRes.data.pagination),
      'GET /api/admin/audit-logs includes pagination metadata'
    );

    // ---------------------------------------------------------
    // 3. Book Creation via API & Audit Log Generation
    // ---------------------------------------------------------
    const createBookRes = await librarianClient.request('POST', '/api/books', {
      body: {
        title: 'Audit Trail Verification Book',
        author: 'Governance Author',
        segment: 'Accounting & Finance',
        category: 'TEXTBOOK',
        totalCopies: 2,
        shelfLocation: 'Rack B-1',
      },
    });
    assert(createBookRes.status === 201, 'Librarian creates book with HTTP 201');
    const testBook = createBookRes.data.book;
    dataManager.createdBookIds.add(testBook.id);

    // ---------------------------------------------------------
    // 4. Audit Logs Pagination & Action Filtering
    // ---------------------------------------------------------
    const paginatedAuditRes = await librarianClient.request('GET', '/api/admin/audit-logs?page=1&limit=2');
    assert(
      paginatedAuditRes.status === 200,
      'GET /api/admin/audit-logs?page=1&limit=2 succeeds with HTTP 200'
    );
    const paginatedLogs = paginatedAuditRes.data.logs || [];
    assert(
      paginatedLogs.length <= 2,
      'Audit log limit bounds result to at most 2 items',
      `Got ${paginatedLogs.length} items`
    );
    assert(
      paginatedAuditRes.data.pagination.page === 1,
      'Audit log pagination metadata correctly reflects page 1'
    );
    assert(
      paginatedAuditRes.data.pagination.limit === 2,
      'Audit log pagination metadata correctly reflects limit 2'
    );
    assert(
      paginatedAuditRes.data.pagination.total >= 1,
      'Audit log pagination metadata correctly calculates total count'
    );
    assert(
      paginatedAuditRes.data.pagination.totalPages >= 1,
      'Audit log pagination metadata correctly calculates totalPages'
    );

    // Filter by action
    const actionFilterRes = await librarianClient.request('GET', '/api/admin/audit-logs?action=BOOK_CREATED');
    assert(
      actionFilterRes.status === 200,
      'GET /api/admin/audit-logs?action=BOOK_CREATED succeeds with HTTP 200'
    );
    const actionFilteredLogs = actionFilterRes.data.logs || [];
    assert(
      actionFilteredLogs.length >= 1 && actionFilteredLogs.every((l) => l.action === 'BOOK_CREATED'),
      'Audit log action filter strictly isolates BOOK_CREATED entries'
    );

    // Zero secret leakage in audit logs
    const auditLeaks = findLeakedSecrets(librarianAuditRes.data);
    assert(
      auditLeaks.length === 0,
      'Zero sensitive security keys leaked in GET /api/admin/audit-logs payload',
      `Leaked: ${auditLeaks.join(', ')}`
    );

    // ---------------------------------------------------------
    // 5. Book Catalog Pagination & Query Security
    // ---------------------------------------------------------
    const paginatedBooksRes = await librarianClient.request('GET', '/api/books?page=1&limit=2');
    assert(
      paginatedBooksRes.status === 200,
      'GET /api/books?page=1&limit=2 succeeds with HTTP 200'
    );
    assert(
      Array.isArray(paginatedBooksRes.data.books),
      'GET /api/books returns books array'
    );
    assert(
      paginatedBooksRes.data.books.length <= 2,
      'Page limit bounds returned books array to at most 2 items'
    );
    assert(
      Boolean(paginatedBooksRes.data.pagination),
      'GET /api/books response includes pagination metadata'
    );
    assert(
      paginatedBooksRes.data.pagination.page === 1,
      'Books pagination metadata accurately reflects page 1'
    );
    assert(
      paginatedBooksRes.data.pagination.limit === 2,
      'Books pagination metadata accurately reflects limit 2'
    );

    // ---------------------------------------------------------
    // 6. Book Management Mutation Restrictions
    // ---------------------------------------------------------
    // A. Student cannot PUT /api/books/:id -> 403
    const studentUpdateBookRes = await studentClient.request('PUT', `/api/books/${testBook.id}`, {
      body: { title: 'Unauthorized Student Title Change' },
    });
    assert(
      studentUpdateBookRes.status === 403,
      'Student is forbidden from updating book with HTTP 403',
      `Got status ${studentUpdateBookRes.status}`
    );

    // B. Teacher cannot PUT /api/books/:id -> 403
    const teacherUpdateBookRes = await teacherClient.request('PUT', `/api/books/${testBook.id}`, {
      body: { title: 'Unauthorized Teacher Title Change' },
    });
    assert(
      teacherUpdateBookRes.status === 403,
      'Teacher is forbidden from updating book with HTTP 403',
      `Got status ${teacherUpdateBookRes.status}`
    );

    // C. Student cannot DELETE /api/books/:id -> 403
    const studentDeleteBookRes = await studentClient.request('DELETE', `/api/books/${testBook.id}`);
    assert(
      studentDeleteBookRes.status === 403,
      'Student is forbidden from deleting book with HTTP 403',
      `Got status ${studentDeleteBookRes.status}`
    );

    // D. Teacher cannot DELETE /api/books/:id -> 403
    const teacherDeleteBookRes = await teacherClient.request('DELETE', `/api/books/${testBook.id}`);
    assert(
      teacherDeleteBookRes.status === 403,
      'Teacher is forbidden from deleting book with HTTP 403',
      `Got status ${teacherDeleteBookRes.status}`
    );

    // E. Librarian successfully updates book with PUT /api/books/:id -> 200
    const librarianUpdateBookRes = await librarianClient.request('PUT', `/api/books/${testBook.id}`, {
      body: {
        title: 'Audit Trail Verification Book (Updated)',
        shelfLocation: 'Rack B-4 (Hardened)',
      },
    });
    assert(
      librarianUpdateBookRes.status === 200,
      'Librarian successfully updates book with HTTP 200',
      `Got status ${librarianUpdateBookRes.status}`
    );

    // Verify AuditLog for BOOK_UPDATED
    const bookUpdatedAudit = await dataManager.prisma.auditLog.findFirst({
      where: {
        action: 'BOOK_UPDATED',
        targetId: testBook.id,
      },
    });
    assert(
      Boolean(bookUpdatedAudit),
      'AuditLog recorded BOOK_UPDATED action inside transaction'
    );
    assert(
      bookUpdatedAudit?.actorId === librarian.id,
      'BOOK_UPDATED AuditLog captures librarian actorId'
    );

    // F. Deletion guard: Book with active issued copies cannot be deleted -> 400
    // Create a second book with an issued copy
    const bookWithActiveLoan = await dataManager.createBook({
      title: 'Book With Active Issued Copy',
      author: 'Issued Author',
      segment: 'Accounting & Finance',
      category: 'TEXTBOOK',
      totalCopies: 1,
    });
    const issuedCopies = await dataManager.prisma.bookCopy.findMany({
      where: { bookId: bookWithActiveLoan.id },
    });
    await dataManager.prisma.bookCopy.update({
      where: { id: issuedCopies[0].id },
      data: { status: 'ISSUED' },
    });

    const deleteWithActiveLoanRes = await librarianClient.request('DELETE', `/api/books/${bookWithActiveLoan.id}`);
    assert(
      deleteWithActiveLoanRes.status === 400,
      'Deleting book with active issued loans is rejected with HTTP 400',
      `Got status ${deleteWithActiveLoanRes.status}`
    );
    assert(
      deleteWithActiveLoanRes.data?.error?.includes('currently issued'),
      'Deletion error message explains active issued copy restriction'
    );

    // G. Librarian successfully deletes book with no active loans -> 200
    // testBook has 0 lendings and all copies are AVAILABLE
    const successfulDeleteBookRes = await librarianClient.request('DELETE', `/api/books/${testBook.id}`);
    assert(
      successfulDeleteBookRes.status === 200,
      'Librarian successfully deletes book with no active loans (HTTP 200)',
      `Got status ${successfulDeleteBookRes.status}`
    );

    // Verify AuditLog for BOOK_DELETED
    const bookDeletedAudit = await dataManager.prisma.auditLog.findFirst({
      where: {
        action: 'BOOK_DELETED',
        targetId: testBook.id,
      },
    });
    assert(
      Boolean(bookDeletedAudit),
      'AuditLog recorded BOOK_DELETED action inside transaction'
    );
    assert(
      bookDeletedAudit?.actorId === librarian.id,
      'BOOK_DELETED AuditLog captures librarian actorId'
    );

    // ---------------------------------------------------------
    // 7. Final Recursive Secret Scan
    // ---------------------------------------------------------
    const catalogLeaks = findLeakedSecrets(paginatedBooksRes.data);
    assert(
      catalogLeaks.length === 0,
      'Zero sensitive security keys leaked in GET /api/books payload',
      `Leaked: ${catalogLeaks.join(', ')}`
    );
  } finally {
    await dataManager.cleanup();
  }
}
