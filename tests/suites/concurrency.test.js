// tests/suites/concurrency.test.js — Step 6 PostgreSQL Concurrency & Advisory Lock Tests
import { createApiClient } from '../helpers/apiClient.js';
import { TestDataManager } from '../helpers/testData.js';

export async function runConcurrencyTests(baseUrl, assert) {
  const dataManager = new TestDataManager();

  try {
    // 1. Setup personas
    const student1 = await dataManager.createStudent({ tag: 'conc_stu1' });
    const student2 = await dataManager.createStudent({ tag: 'conc_stu2' });
    const librarian = await dataManager.createLibrarian({ tag: 'conc_lib' });

    const student1Client = createApiClient(baseUrl);
    const student2Client = createApiClient(baseUrl);
    const librarianClient = createApiClient(baseUrl);

    student1Client.loginAs(student1);
    student2Client.loginAs(student2);
    librarianClient.loginAs(librarian);

    // Book A: Multi-copy book for borrow, approve, renew, return concurrency races
    const bookA = await dataManager.createBook({
      title: 'Concurrency Book A',
      totalCopies: 5,
    });

    // Book B: Single-copy book for last-copy allocation race
    const bookB = await dataManager.createBook({
      title: 'Concurrency Single Copy Book B',
      totalCopies: 1,
    });

    // -------------------------------------------------------------
    // Test (a): 10 parallel borrow requests for same book by one user
    // -------------------------------------------------------------
    const borrowPromises = Array.from({ length: 10 }).map(() =>
      student1Client.request('POST', '/api/lending/request-borrow', {
        body: { bookId: bookA.id },
      })
    );
    const borrowResponses = await Promise.all(borrowPromises);
    const successBorrows = borrowResponses.filter((r) => r.status === 200 || r.status === 201);
    const rejectedBorrows = borrowResponses.filter((r) => r.status === 400);

    assert(
      successBorrows.length === 1,
      'Parallel borrow: exactly 1 request succeeded (HTTP 200/201)',
      `Got ${successBorrows.length} successes`
    );
    assert(
      rejectedBorrows.length === 9,
      'Parallel borrow: exactly 9 requests rejected (HTTP 400)',
      `Got ${rejectedBorrows.length} rejections`
    );

    const dbRequestsA = await dataManager.prisma.bookRequest.findMany({
      where: { userId: student1.id, bookId: bookA.id, status: 'PENDING' },
    });
    assert(
      dbRequestsA.length === 1,
      'DB verification: exactly 1 PENDING request recorded in database',
      `Found ${dbRequestsA.length} pending requests`
    );
    const requestIdA = dbRequestsA[0]?.id;

    // -------------------------------------------------------------
    // Test (b): 2 parallel approves for one request
    // -------------------------------------------------------------
    const approvePromises = [
      librarianClient.request('POST', `/api/lending/approve/${requestIdA}`),
      librarianClient.request('POST', `/api/lending/approve/${requestIdA}`),
    ];
    const approveResponses = await Promise.all(approvePromises);
    const successApproves = approveResponses.filter((r) => r.status === 200);
    const conflictApproves = approveResponses.filter((r) => r.status === 409 || r.status === 400);

    assert(
      successApproves.length === 1,
      'Parallel approve: exactly 1 approval succeeded (HTTP 200)',
      `Got ${successApproves.length} successes`
    );
    assert(
      conflictApproves.length === 1,
      'Parallel approve: exactly 1 approval rejected with conflict (HTTP 409/400)',
      `Got ${conflictApproves.length} conflicts`
    );

    const lendingsA = await dataManager.prisma.lending.findMany({
      where: { userId: student1.id, bookCopy: { bookId: bookA.id }, status: 'ISSUED' },
    });
    assert(
      lendingsA.length === 1,
      'DB verification: exactly 1 active lending created for Book A',
      `Found ${lendingsA.length} active lendings`
    );
    const lendingIdA = lendingsA[0]?.id;

    // -------------------------------------------------------------
    // Test (c): 2 students requesting the last copy, both approved in parallel
    // -------------------------------------------------------------
    const reqB1 = await student1Client.request('POST', '/api/lending/request-borrow', {
      body: { bookId: bookB.id },
    });
    const reqB2 = await student2Client.request('POST', '/api/lending/request-borrow', {
      body: { bookId: bookB.id },
    });
    assert(
      (reqB1.status === 200 || reqB1.status === 201) && (reqB2.status === 200 || reqB2.status === 201),
      'Both students successfully requested single-copy Book B'
    );

    const b1RequestId = reqB1.body?.request?.id;
    const b2RequestId = reqB2.body?.request?.id;

    const lastCopyApprovePromises = [
      librarianClient.request('POST', `/api/lending/approve/${b1RequestId}`),
      librarianClient.request('POST', `/api/lending/approve/${b2RequestId}`),
    ];
    const lastCopyResponses = await Promise.all(lastCopyApprovePromises);
    const lastCopySuccess = lastCopyResponses.filter((r) => r.status === 200);
    const lastCopyRejected = lastCopyResponses.filter((r) => r.status === 400);

    assert(
      lastCopySuccess.length === 1,
      'Parallel last-copy approve: exactly 1 succeeded with HTTP 200',
      `Got ${lastCopySuccess.length} successes`
    );
    assert(
      lastCopyRejected.length === 1,
      'Parallel last-copy approve: exactly 1 rejected with HTTP 400 (no copies available)',
      `Got ${lastCopyRejected.length} rejections`
    );

    const bookBInDb = await dataManager.prisma.book.findUnique({
      where: { id: bookB.id },
      include: { copies: true },
    });
    assert(
      bookBInDb?.availableCopies === 0,
      'Book B availableCopies is exactly 0 (no negative inventory count)',
      `Available copies: ${bookBInDb?.availableCopies}`
    );

    const bookBLendings = await dataManager.prisma.lending.findMany({
      where: { bookCopy: { bookId: bookB.id }, status: 'ISSUED' },
    });
    assert(
      bookBLendings.length === 1,
      'Book B has exactly 1 active lending (no duplicate copy allocation)',
      `Active lendings: ${bookBLendings.length}`
    );

    // -------------------------------------------------------------
    // Test (d): 2 parallel renews on Book A loan
    // -------------------------------------------------------------
    const renewPromises = [
      student1Client.request('POST', `/api/lending/renew/${lendingIdA}`),
      student1Client.request('POST', `/api/lending/renew/${lendingIdA}`),
    ];
    const renewResponses = await Promise.all(renewPromises);
    const successRenews = renewResponses.filter((r) => r.status === 200);
    const rejectedRenews = renewResponses.filter((r) => r.status === 400);

    assert(
      successRenews.length === 1,
      'Parallel renew: exactly 1 renewal succeeded (HTTP 200)',
      `Got ${successRenews.length} successes`
    );
    assert(
      rejectedRenews.length === 1,
      'Parallel renew: exactly 1 renewal rejected (HTTP 400)',
      `Got ${rejectedRenews.length} rejections`
    );

    const lendingAfterRenew = await dataManager.prisma.lending.findUnique({ where: { id: lendingIdA } });
    assert(
      lendingAfterRenew?.renewalCount === 1,
      'DB verification: renewalCount is exactly 1',
      `Got renewalCount ${lendingAfterRenew?.renewalCount}`
    );

    // -------------------------------------------------------------
    // Test (e): 2 parallel returns on Book A loan
    // -------------------------------------------------------------
    const returnPromises = [
      librarianClient.request('POST', `/api/lending/return/${lendingIdA}`),
      librarianClient.request('POST', `/api/lending/return/${lendingIdA}`),
    ];
    const returnResponses = await Promise.all(returnPromises);
    const successReturns = returnResponses.filter((r) => r.status === 200);
    const conflictReturns = returnResponses.filter((r) => r.status === 409 || r.status === 400);

    assert(
      successReturns.length === 1,
      'Parallel return: exactly 1 return succeeded (HTTP 200)',
      `Got ${successReturns.length} successes`
    );
    assert(
      conflictReturns.length === 1,
      'Parallel return: exactly 1 return rejected with conflict (HTTP 409/400)',
      `Got ${conflictReturns.length} conflicts`
    );

    const lendingAfterReturn = await dataManager.prisma.lending.findUnique({
      where: { id: lendingIdA },
      include: { bookCopy: { include: { book: true } } },
    });
    assert(
      lendingAfterReturn?.status === 'RETURNED',
      'DB verification: lending status is RETURNED'
    );
    assert(
      lendingAfterReturn?.bookCopy?.status === 'AVAILABLE',
      'DB verification: bookCopy status restored to AVAILABLE'
    );

    // -------------------------------------------------------------
    // Test (f): Database-wide consistency queries
    // -------------------------------------------------------------
    // 1. ISSUED lendings whose copy is not ISSUED: must be 0
    const inconsistentLendings = await dataManager.prisma.lending.count({
      where: {
        status: 'ISSUED',
        bookCopy: { status: { not: 'ISSUED' } },
      },
    });
    assert(
      inconsistentLendings === 0,
      'Consistency check: ISSUED lendings whose copy is not ISSUED is 0',
      `Found ${inconsistentLendings}`
    );

    // 2. ISSUED copies without an ISSUED lending: must be 0
    const issuedCopies = await dataManager.prisma.bookCopy.findMany({
      where: { status: 'ISSUED' },
      include: {
        lendings: { where: { status: 'ISSUED' } },
      },
    });
    const orphanCopies = issuedCopies.filter((c) => c.lendings.length === 0).length;
    assert(
      orphanCopies === 0,
      'Consistency check: ISSUED copies without an ISSUED lending is 0',
      `Found ${orphanCopies}`
    );

    // 3. Users with two ISSUED lendings of one book: must be 0
    const allActiveLendings = await dataManager.prisma.lending.findMany({
      where: { status: 'ISSUED' },
      include: { bookCopy: { select: { bookId: true } } },
    });
    const userBookMap = new Map();
    let duplicateActiveLendings = 0;
    for (const l of allActiveLendings) {
      const key = `${l.userId}:${l.bookCopy.bookId}`;
      if (userBookMap.has(key)) {
        duplicateActiveLendings++;
      } else {
        userBookMap.set(key, l.id);
      }
    }
    assert(
      duplicateActiveLendings === 0,
      'Consistency check: Users with two ISSUED lendings of one book is 0',
      `Found ${duplicateActiveLendings}`
    );

    // 4. Duplicate PENDING requests per user+book: must be 0
    const allPendingRequests = await dataManager.prisma.bookRequest.findMany({
      where: { status: 'PENDING', type: 'BORROW' },
    });
    const userPendingMap = new Map();
    let duplicatePending = 0;
    for (const r of allPendingRequests) {
      const key = `${r.userId}:${r.bookId}`;
      if (userPendingMap.has(key)) {
        duplicatePending++;
      } else {
        userPendingMap.set(key, r.id);
      }
    }
    assert(
      duplicatePending === 0,
      'Consistency check: Duplicate PENDING requests per user+book is 0',
      `Found ${duplicatePending}`
    );
  } finally {
    await dataManager.cleanup();
  }
}
