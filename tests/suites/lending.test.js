// tests/suites/lending.test.js — Step 5 Lending Regression Tests
import { createApiClient } from '../helpers/apiClient.js';
import { TestDataManager } from '../helpers/testData.js';

export async function runLendingTests(baseUrl, assert) {
  const dataManager = new TestDataManager();

  try {
    // Setup personas
    const studentA = await dataManager.createStudent({ tag: 'lend_a' });
    const studentB = await dataManager.createStudent({ tag: 'lend_b' });
    const teacher = await dataManager.createTeacher({ tag: 'lend_tea' });
    const librarian = await dataManager.createLibrarian({ tag: 'lend_lib' });

    const studentAClient = createApiClient(baseUrl);
    const studentBClient = createApiClient(baseUrl);
    const teacherClient = createApiClient(baseUrl);
    const librarianClient = createApiClient(baseUrl);

    studentAClient.loginAs(studentA);
    studentBClient.loginAs(studentB);
    teacherClient.loginAs(teacher);
    librarianClient.loginAs(librarian);

    // 1. Borrow request creation
    const book1 = await dataManager.createBook({ title: 'Lending Policy Book 1', totalCopies: 2 });
    const borrowReq1 = await studentAClient.request('POST', '/api/lending/request-borrow', {
      body: { bookId: book1.id, message: 'Need for exam prep' },
    });
    assert(
      borrowReq1.status === 200 || borrowReq1.status === 201,
      'Student can create borrow request for available book (HTTP 200/201)',
      `Got status ${borrowReq1.status}`
    );
    const requestId1 = borrowReq1.body?.request?.id;
    assert(Boolean(requestId1), 'Borrow request returns created request ID');

    // 2. Duplicate pending request prevention
    const dupBorrowReq = await studentAClient.request('POST', '/api/lending/request-borrow', {
      body: { bookId: book1.id },
    });
    assert(
      dupBorrowReq.status === 400,
      'Duplicate pending borrow request for same book is rejected (HTTP 400)',
      `Got status ${dupBorrowReq.status}: ${dupBorrowReq.body?.error}`
    );
    assert(
      dupBorrowReq.body?.error?.includes('already have a pending request'),
      'Duplicate borrow request error specifies pending request conflict'
    );

    // 3. Borrow request cancellation by borrower
    const cancelOwn = await studentAClient.request('POST', `/api/lending/cancel-request/${requestId1}`);
    assert(
      cancelOwn.status === 200,
      'Borrower can cancel own pending BORROW request (HTTP 200)',
      `Got status ${cancelOwn.status}`
    );

    // Verify request is no longer pending in DB
    const cancelledDbReq = await dataManager.prisma.bookRequest.findUnique({ where: { id: requestId1 } });
    assert(
      cancelledDbReq?.status === 'REJECTED' && cancelledDbReq?.responseMessage === 'Cancelled by user',
      'Cancelled request marked REJECTED with "Cancelled by user" message'
    );

    // 4. Prevention of unauthorized cancellation
    // Re-create request for Student A
    const borrowReq2 = await studentAClient.request('POST', '/api/lending/request-borrow', {
      body: { bookId: book1.id },
    });
    const requestId2 = borrowReq2.body?.request?.id;

    // Student B attempts to cancel Student A's request
    const unauthorizedCancel = await studentBClient.request('POST', `/api/lending/cancel-request/${requestId2}`);
    assert(
      unauthorizedCancel.status === 404 || unauthorizedCancel.status === 403,
      'Cross-user cancellation is rejected (HTTP 404/403)',
      `Got status ${unauthorizedCancel.status}`
    );

    // 5. Approval workflow & 30-day lending policy
    const approveReq = await librarianClient.request('POST', `/api/lending/approve/${requestId2}`);
    assert(
      approveReq.status === 200,
      'Librarian can approve pending borrow request (HTTP 200)',
      `Got status ${approveReq.status}`
    );
    const lendingId = approveReq.body?.lending?.id;
    assert(Boolean(lendingId), 'Approve response returns active lending ID');

    // Verify 30-day loan period calculation
    const dbLending = await dataManager.prisma.lending.findUnique({
      where: { id: lendingId },
      include: { bookCopy: { include: { book: true } } },
    });
    assert(dbLending?.status === 'ISSUED', 'Approved lending status is ISSUED');
    assert(dbLending?.bookCopy?.status === 'ISSUED', 'Allocated BookCopy status updated to ISSUED');

    const issuedTime = new Date(dbLending.issuedDate).getTime();
    const dueTime = new Date(dbLending.dueDate).getTime();
    const daysDiff = Math.round((dueTime - issuedTime) / (1000 * 60 * 60 * 24));
    assert(
      daysDiff === 30,
      `Loan period is exactly 30 days (expected 30, got ${daysDiff})`
    );

    // Verify Book availableCopies decremented
    const bookAfterIssue = await dataManager.prisma.book.findUnique({ where: { id: book1.id } });
    assert(
      bookAfterIssue?.availableCopies === book1.availableCopies - 1,
      'Book availableCopies decremented by 1 after issue'
    );

    // 6. Ten-book student borrowing limit
    // Create 9 more books and issue them to studentA so studentA reaches exactly 10 active loans
    const fillerBooks = [];
    for (let i = 0; i < 9; i++) {
      const fb = await dataManager.createBook({ title: `Limit Filler Book ${i}`, totalCopies: 1 });
      fillerBooks.push(fb);
      await dataManager.createLending({
        userId: studentA.id,
        bookCopyId: fb.copies[0].id,
        status: 'ISSUED',
      });
      // Decrement availableCopies
      await dataManager.prisma.book.update({
        where: { id: fb.id },
        data: { availableCopies: 0 },
      });
    }

    // Now Student A has 10 active loans. Attempting to request an 11th book must be rejected.
    const book11 = await dataManager.createBook({ title: 'Book 11 Over Limit', totalCopies: 1 });
    const limitReq = await studentAClient.request('POST', '/api/lending/request-borrow', {
      body: { bookId: book11.id },
    });
    assert(
      limitReq.status === 400,
      'Borrow request exceeding 10-book student limit is rejected (HTTP 400)',
      `Got status ${limitReq.status}: ${limitReq.body?.error}`
    );
    assert(
      limitReq.body?.error?.includes('10 books'),
      'Limit error message mentions 10 books limit'
    );

    // Clean up filler lendings so studentA is unblocked for remaining tests
    await dataManager.prisma.lending.deleteMany({
      where: { userId: studentA.id, id: { not: lendingId } },
    });

    // 7. Single-renewal restriction
    // First renewal should succeed
    const firstRenew = await studentAClient.request('POST', `/api/lending/renew/${lendingId}`);
    assert(
      firstRenew.status === 200,
      'First renewal of active loan succeeds (HTTP 200)',
      `Got status ${firstRenew.status}`
    );

    const dbLendingAfterRenew1 = await dataManager.prisma.lending.findUnique({ where: { id: lendingId } });
    assert(
      dbLendingAfterRenew1?.renewalCount === 1,
      'Lending renewalCount incremented to 1'
    );

    // Second renewal must fail (MAX_RENEWALS = 1)
    const secondRenew = await studentAClient.request('POST', `/api/lending/renew/${lendingId}`);
    assert(
      secondRenew.status === 400,
      'Second renewal is rejected with single-renewal policy (HTTP 400)',
      `Got status ${secondRenew.status}: ${secondRenew.body?.error}`
    );
    assert(
      secondRenew.body?.error?.includes('limit of 1 renewal'),
      'Error message enforces maximum limit of 1 renewal'
    );

    // 8. Overdue renewal restriction
    // Create an overdue lending for studentB
    const overdueBook = await dataManager.createBook({ title: 'Overdue Policy Book', totalCopies: 1 });
    const overdueLending = await dataManager.createLending({
      userId: studentB.id,
      bookCopyId: overdueBook.copies[0].id,
      status: 'ISSUED',
      dueDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days in past
      renewalCount: 0,
    });

    const overdueRenew = await studentBClient.request('POST', `/api/lending/renew/${overdueLending.id}`);
    assert(
      overdueRenew.status === 400,
      'Renewal of overdue book is rejected (HTTP 400)',
      `Got status ${overdueRenew.status}: ${overdueRenew.body?.error}`
    );
    assert(
      overdueRenew.body?.error?.includes('Cannot renew') || overdueRenew.body?.error?.includes('overdue'),
      'Overdue renewal error message identifies overdue items'
    );

    // 9. Teacher return-request workflow
    // Teacher requests return of Student A's active loan
    const teacherReqReturn = await teacherClient.request('POST', `/api/lending/request-return/${lendingId}`, {
      body: { message: 'Faculty requires this book for syllabus planning.' },
    });
    assert(
      teacherReqReturn.status === 200 || teacherReqReturn.status === 201,
      'Teacher can submit return-request for student loan (HTTP 200/201)',
      `Got status ${teacherReqReturn.status}`
    );

    // Duplicate return request rejected
    const dupTeacherReq = await teacherClient.request('POST', `/api/lending/request-return/${lendingId}`);
    assert(
      dupTeacherReq.status === 409,
      'Duplicate teacher return-request is rejected (HTTP 409 Conflict)',
      `Got status ${dupTeacherReq.status}`
    );

    // 10. Pending return-request renewal restriction
    // Reset renewalCount on lending to 0 to specifically test the pending return-request block
    await dataManager.prisma.lending.update({
      where: { id: lendingId },
      data: { renewalCount: 0 },
    });
    const renewBlockedByReturnReq = await studentAClient.request('POST', `/api/lending/renew/${lendingId}`);
    assert(
      renewBlockedByReturnReq.status === 400,
      'Renewal is blocked when pending return-request exists (HTTP 400)',
      `Got status ${renewBlockedByReturnReq.status}: ${renewBlockedByReturnReq.body?.error}`
    );
    assert(
      renewBlockedByReturnReq.body?.error?.includes('pending return request'),
      'Error message identifies pending return request'
    );

    // 11. Student cannot cancel teacher RETURN_REQUEST
    const pendingReturnReq = await dataManager.prisma.bookRequest.findFirst({
      where: { userId: studentA.id, bookId: book1.id, type: 'RETURN_REQUEST', status: 'PENDING' },
    });
    if (pendingReturnReq) {
      const cancelReturnReq = await studentAClient.request('POST', `/api/lending/cancel-request/${pendingReturnReq.id}`);
      assert(
        cancelReturnReq.status === 403,
        'Borrower cannot cancel a teacher RETURN_REQUEST (HTTP 403)',
        `Got status ${cancelReturnReq.status}`
      );
    }

    // 12. Rejection workflow
    // Create Student C with clean record
    const studentC = await dataManager.createStudent({ tag: 'lend_c' });
    const studentCClient = createApiClient(baseUrl);
    studentCClient.loginAs(studentC);

    const bookToReject = await dataManager.createBook({ title: 'Book To Reject', totalCopies: 1 });
    const rejReq = await studentCClient.request('POST', '/api/lending/request-borrow', {
      body: { bookId: bookToReject.id },
    });
    assert(
      rejReq.status === 200 || rejReq.status === 201,
      'Student C successfully requests book for rejection test'
    );
    const rejReqId = rejReq.body?.request?.id;

    const librarianReject = await librarianClient.request('POST', `/api/lending/reject/${rejReqId}`, {
      body: { reason: 'Reserved for reference library only.' },
    });
    assert(
      librarianReject.status === 200,
      'Librarian can reject pending borrow request (HTTP 200)',
      `Got status ${librarianReject.status}`
    );

    const dbRejectedReq = await dataManager.prisma.bookRequest.findUnique({ where: { id: rejReqId } });
    assert(
      dbRejectedReq?.status === 'REJECTED' && dbRejectedReq?.responseMessage?.includes('Reserved for reference'),
      'Rejected request has REJECTED status and librarian responseMessage in DB'
    );

    // 13. Return processing & Zero monetary fine policy
    const returnRes = await librarianClient.request('POST', `/api/lending/return/${lendingId}`);
    assert(
      returnRes.status === 200,
      'Librarian can process book return (HTTP 200)',
      `Got status ${returnRes.status}`
    );
    assert(
      returnRes.body?.fine === 0,
      'Zero monetary fine policy enforced on return (fine === 0)'
    );

    // 14. Physical copy status consistency
    const returnedLending = await dataManager.prisma.lending.findUnique({
      where: { id: lendingId },
      include: { bookCopy: { include: { book: true } } },
    });
    assert(
      returnedLending?.status === 'RETURNED' && returnedLending?.returnedDate !== null,
      'Lending marked RETURNED with valid returnedDate'
    );
    assert(
      returnedLending?.bookCopy?.status === 'AVAILABLE',
      'Returned BookCopy status restored to AVAILABLE'
    );
    assert(
      returnedLending?.fine === 0,
      'Database lending fine record is 0'
    );

    // Also verify pending return requests were fulfilled
    const fulfilledReturnReq = await dataManager.prisma.bookRequest.findFirst({
      where: { id: pendingReturnReq?.id },
    });
    if (fulfilledReturnReq) {
      assert(
        fulfilledReturnReq.status === 'APPROVED',
        'Pending return-request fulfilled (marked APPROVED) upon book return'
      );
    }
  } finally {
    await dataManager.cleanup();
  }
}
