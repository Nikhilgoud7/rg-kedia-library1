// tests/suites/dataExport.test.js — Phase 9A Personal Data Export & DPDP Compliance Test Suite
import crypto from 'crypto';
import { createApiClient, findLeakedSecrets } from '../helpers/apiClient.js';
import { TestDataManager } from '../helpers/testData.js';

export async function runDataExportTests(baseUrl, assert) {
  const dataManager = new TestDataManager();
  const prisma = dataManager.prisma;

  try {
    // ---------------------------------------------------------
    // 0. Persona & Client Setup
    // ---------------------------------------------------------
    const librarian = await dataManager.createLibrarian({ tag: 'p9a_lib' });
    const librarianClient = createApiClient(baseUrl);
    librarianClient.loginAs(librarian);

    const teacher = await dataManager.createTeacher({ tag: 'p9a_tch' });
    const teacherClient = createApiClient(baseUrl);
    teacherClient.loginAs(teacher);

    const student = await dataManager.createStudent({ tag: 'p9a_stu' });
    const studentClient = createApiClient(baseUrl);
    studentClient.loginAs(student);

    const otherStudent = await dataManager.createStudent({ tag: 'p9a_oth' });
    const otherStudentClient = createApiClient(baseUrl);
    otherStudentClient.loginAs(otherStudent);

    const unauthClient = createApiClient(baseUrl);

    // ---------------------------------------------------------
    // 1. Authentication & Role Access
    // ---------------------------------------------------------
    // 1.1 Unauthenticated request is rejected with HTTP 401
    const unauthRes = await unauthClient.request('GET', '/api/user/data-export');
    assert(unauthRes.status === 401, 'Unauthenticated GET /api/user/data-export is rejected with HTTP 401');

    // 1.2 Student can export own data with HTTP 200
    const studentRes = await studentClient.request('GET', '/api/user/data-export');
    assert(studentRes.status === 200, 'Student GET /api/user/data-export succeeds with HTTP 200');

    // 1.3 Teacher can export own data with HTTP 200
    const teacherRes = await teacherClient.request('GET', '/api/user/data-export');
    assert(teacherRes.status === 200, 'Teacher GET /api/user/data-export succeeds with HTTP 200');

    // 1.4 Librarian can export own data with HTTP 200
    const librarianRes = await librarianClient.request('GET', '/api/user/data-export');
    assert(librarianRes.status === 200, 'Librarian GET /api/user/data-export succeeds with HTTP 200');

    // ---------------------------------------------------------
    // 2. HTTP Security & Anti-Caching Headers
    // ---------------------------------------------------------
    const contentType = studentRes.headers.get('content-type') || '';
    assert(contentType.includes('application/json'), 'Content-Type indicates application/json');
    assert(contentType.includes('charset=utf-8'), 'Content-Type specifies charset=utf-8');

    const cacheControl = studentRes.headers.get('cache-control') || '';
    assert(cacheControl.includes('no-store'), 'Cache-Control header specifies no-store');
    assert(cacheControl.includes('no-cache'), 'Cache-Control header specifies no-cache');
    assert(cacheControl.includes('must-revalidate'), 'Cache-Control header specifies must-revalidate');
    assert(cacheControl.includes('private'), 'Cache-Control header specifies private');

    const pragma = studentRes.headers.get('pragma') || '';
    assert(pragma.includes('no-cache'), 'Pragma header specifies no-cache');

    const expires = studentRes.headers.get('expires') || '';
    assert(expires === '0', 'Expires header specifies 0');

    const disposition = studentRes.headers.get('content-disposition') || '';
    assert(disposition.includes('attachment'), 'Content-Disposition indicates attachment');
    assert(disposition.includes('filename="rg-kedia-personal-data-export-'), 'Content-Disposition includes standardized filename prefix');
    assert(disposition.endsWith('.json"'), 'Content-Disposition filename ends with .json');

    // ---------------------------------------------------------
    // 3. DPDP Metadata & Principal Profile Integrity
    // ---------------------------------------------------------
    const studentData = studentRes.body;
    assert(studentData.metadata, 'Export payload contains metadata block');
    assert(studentData.metadata.version === '1.0', 'Metadata version is 1.0');
    assert(studentData.metadata.complianceStandard === 'Digital Personal Data Protection Act, 2023 (DPDP Act)', 'Metadata specifies DPDP Act compliance standard');
    assert(studentData.metadata.institution === 'R.G. Kedia College of Commerce', 'Metadata specifies institution name');
    assert(studentData.metadata.dataPrincipalId === student.id, 'Metadata dataPrincipalId matches authenticated student ID');
    assert(Boolean(studentData.metadata.exportedAt), 'Metadata contains exportedAt timestamp');

    assert(studentData.profile, 'Export payload contains profile block');
    assert(studentData.profile.id === student.id, 'Profile ID matches authenticated student ID');
    assert(studentData.profile.email === student.email, 'Profile email matches student email');
    assert(studentData.profile.role === 'STUDENT', 'Profile role is STUDENT');
    assert(studentData.profile.rollNumber === student.rollNumber, 'Profile rollNumber matches student rollNumber');

    // ---------------------------------------------------------
    // 4. Strict IDOR Defense & Parameter Tampering Immunity
    // ---------------------------------------------------------
    // 4.1 Student attempts to supply another user's ID via query param
    const idorQueryRes = await studentClient.request('GET', `/api/user/data-export?userId=${otherStudent.id}&id=${librarian.id}`);
    assert(idorQueryRes.status === 200, 'Request with spoofed query param returns 200');
    assert(idorQueryRes.body.metadata.dataPrincipalId === student.id, 'IDOR query attempt ignored: metadata principal ID remains authenticated student ID');
    assert(idorQueryRes.body.profile.id === student.id, 'IDOR query attempt ignored: profile ID remains authenticated student ID');
    assert(idorQueryRes.body.profile.id !== otherStudent.id, 'IDOR query attempt strictly denied from reading other student profile');
    assert(idorQueryRes.body.profile.id !== librarian.id, 'IDOR query attempt strictly denied from reading librarian profile');

    // 4.2 Teacher attempts to supply student ID via query param
    const teacherIdorRes = await teacherClient.request('GET', `/api/user/data-export?userId=${student.id}`);
    assert(teacherIdorRes.status === 200, 'Teacher request with query param returns 200');
    assert(teacherIdorRes.body.metadata.dataPrincipalId === teacher.id, 'Teacher receives strictly own metadata principal ID');
    assert(teacherIdorRes.body.profile.id === teacher.id, 'Teacher receives strictly own profile ID');

    // ---------------------------------------------------------
    // 5. Rich Record Export, Flattened Inventory & Data Minimization (SEC-9A-02)
    // ---------------------------------------------------------
    // Use a dedicated student for lending/request lifecycle to preserve rate-limiting quotas
    const studentLifecycle = await dataManager.createStudent({ tag: 'p9a_lc' });
    const lcClient = createApiClient(baseUrl);
    lcClient.loginAs(studentLifecycle);

    const testBook = await dataManager.createBook({
      title: 'DPDP Test Subject Guide',
      author: 'Academic Test Author',
      totalCopies: 1,
      tag: 'dpdp_export',
    });
    const copy = testBook.copies[0];

    const lending = await dataManager.createLending({
      userId: studentLifecycle.id,
      bookCopyId: copy.id,
      status: 'ISSUED',
      renewalCount: 1,
    });

    // Create a book request for student
    const request = await prisma.bookRequest.create({
      data: {
        userId: studentLifecycle.id,
        bookId: testBook.id,
        type: 'BORROW',
        status: 'PENDING',
        message: 'Requesting book for semester examination',
      },
    });
    dataManager.createdRequestIds.add(request.id);

    // Create a notification for student
    const notification = await prisma.notification.create({
      data: {
        userId: studentLifecycle.id,
        title: 'Book Issued Confirmation',
        message: 'Your requested book has been issued.',
        type: 'BOOK_ISSUED',
        read: false,
      },
    });
    dataManager.createdNotificationIds.add(notification.id);

    // Fetch export with active loan, request, and notification
    const activeExportRes = await lcClient.request('GET', '/api/user/data-export');
    assert(activeExportRes.status === 200, 'Export with active records returns 200');
    const activePayload = activeExportRes.body;

    assert(Array.isArray(activePayload.activeLoans), 'activeLoans is an array');
    assert(activePayload.activeLoans.length === 1, 'activeLoans contains 1 active record');
    const exportedLoan = activePayload.activeLoans[0];
    assert(exportedLoan.id === lending.id, 'activeLoan ID matches created lending ID');
    assert(exportedLoan.status === 'ISSUED', 'activeLoan status is ISSUED');
    assert(exportedLoan.renewalCount === 1, 'activeLoan renewalCount is preserved');

    // SEC-9A-02: Assert redundant nested bookCopy object is completely removed
    assert(!('bookCopy' in exportedLoan), 'activeLoan strictly omits redundant nested bookCopy object (SEC-9A-02)');
    // Assert flattened attributes are preserved
    assert(exportedLoan.barcode === copy.barcode, 'activeLoan retains flattened barcode');
    assert(exportedLoan.copyNumber === copy.copyNumber, 'activeLoan retains flattened copyNumber');
    assert(exportedLoan.shelfLocation === copy.shelfLocation, 'activeLoan retains flattened shelfLocation');
    assert(exportedLoan.bookTitle === testBook.title, 'activeLoan retains flattened bookTitle');
    assert(exportedLoan.bookAuthor === testBook.author, 'activeLoan retains flattened bookAuthor');

    assert(Array.isArray(activePayload.historicalLoans), 'historicalLoans is an array');
    assert(activePayload.historicalLoans.length === 0, 'historicalLoans contains 0 records before return');

    assert(Array.isArray(activePayload.bookRequests), 'bookRequests is an array');
    assert(activePayload.bookRequests.length === 1, 'bookRequests contains 1 record');
    assert(activePayload.bookRequests[0].id === request.id, 'bookRequest ID matches created request ID');
    assert(activePayload.bookRequests[0].type === 'BORROW', 'bookRequest type is BORROW');
    assert(activePayload.bookRequests[0].bookTitle === testBook.title, 'bookRequest bookTitle matches test book');

    assert(Array.isArray(activePayload.notifications), 'notifications is an array');
    assert(activePayload.notifications.length === 1, 'notifications contains 1 record');
    assert(activePayload.notifications[0].id === notification.id, 'notification ID matches created notification ID');
    assert(activePayload.notifications[0].title === 'Book Issued Confirmation', 'notification title matches');

    // Student export does NOT include academicMaterialsUploaded
    assert(activePayload.academicMaterialsUploaded === undefined, 'Student export does not include academicMaterialsUploaded');

    // Now return the loan to test historicalLoans classification
    await prisma.lending.update({
      where: { id: lending.id },
      data: {
        status: 'RETURNED',
        returnedDate: new Date(),
      },
    });

    const returnedExportRes = await lcClient.request('GET', '/api/user/data-export');
    assert(returnedExportRes.status === 200, 'Export after return returns 200');
    const returnedPayload = returnedExportRes.body;
    assert(returnedPayload.activeLoans.length === 0, 'activeLoans is now empty after return');
    assert(returnedPayload.historicalLoans.length === 1, 'historicalLoans contains returned loan');
    const returnedLoan = returnedPayload.historicalLoans[0];
    assert(returnedLoan.id === lending.id, 'historicalLoans contains the returned lending ID');
    assert(Boolean(returnedLoan.returnedDate), 'historicalLoan contains returnedDate timestamp');

    // SEC-9A-02: Assert historical loan also strictly omits redundant nested bookCopy
    assert(!('bookCopy' in returnedLoan), 'historicalLoan strictly omits redundant nested bookCopy object (SEC-9A-02)');
    assert(returnedLoan.barcode === copy.barcode, 'historicalLoan retains flattened barcode');
    assert(returnedLoan.copyNumber === copy.copyNumber, 'historicalLoan retains flattened copyNumber');
    assert(returnedLoan.shelfLocation === copy.shelfLocation, 'historicalLoan retains flattened shelfLocation');

    // ---------------------------------------------------------
    // 6. Role Distinctions & Academic Materials Attribution
    // ---------------------------------------------------------
    assert(Array.isArray(teacherRes.body.academicMaterialsUploaded), 'Teacher export includes academicMaterialsUploaded array');
    assert(Array.isArray(librarianRes.body.academicMaterialsUploaded), 'Librarian export includes academicMaterialsUploaded array');

    // ---------------------------------------------------------
    // 7. Security: Zero Leaks of Sensitive Credentials & Hashes
    // ---------------------------------------------------------
    const studentLeaks = findLeakedSecrets(activePayload);
    assert(studentLeaks.length === 0, `Student export leaked no secrets (found: ${studentLeaks.join(', ')})`);

    const teacherLeaks = findLeakedSecrets(teacherRes.body);
    assert(teacherLeaks.length === 0, `Teacher export leaked no secrets (found: ${teacherLeaks.join(', ')})`);

    const librarianLeaks = findLeakedSecrets(librarianRes.body);
    assert(librarianLeaks.length === 0, `Librarian export leaked no secrets (found: ${librarianLeaks.join(', ')})`);

    assert(!('password' in activePayload.profile), 'Profile does not contain password');
    assert(!('tokenVersion' in activePayload.profile), 'Profile does not contain tokenVersion');
    assert(!('failedLoginAttempts' in activePayload.profile), 'Profile does not contain failedLoginAttempts');
    assert(!('lockedUntil' in activePayload.profile), 'Profile does not contain lockedUntil');

    // ---------------------------------------------------------
    // 8. Audit Event Generation (SEC-9A-03: DATA_EXPORT_GENERATED)
    // ---------------------------------------------------------
    const exportAuditLogs = await prisma.auditLog.findMany({
      where: {
        action: 'DATA_EXPORT_GENERATED',
        actorId: student.id,
      },
      orderBy: { timestamp: 'desc' },
    });
    assert(exportAuditLogs.length > 0, 'DATA_EXPORT_GENERATED audit log was recorded for student export (SEC-9A-03)');
    const studentAudit = exportAuditLogs[0];
    assert(studentAudit.actorId === student.id, 'Audit log actorId matches authenticated student ID');
    assert(studentAudit.targetId === student.id, 'Audit log targetId matches student ID');
    assert(Boolean(studentAudit.details), 'Audit log details string is present');

    const auditDetails = JSON.parse(studentAudit.details);
    assert(auditDetails.role === 'STUDENT', 'Audit log details records correct principal role');
    assert(auditDetails.recordsSummary, 'Audit log details records recordsSummary metadata');
    assert(typeof auditDetails.recordsSummary.activeLoansCount === 'number', 'Audit details records numeric activeLoansCount');

    const auditLeaks = findLeakedSecrets(auditDetails);
    assert(auditLeaks.length === 0, 'Audit log details contains zero leaked secrets or personal data');

    // Verify unauthenticated rejected requests do NOT generate audit log events
    const unauthAuditLogs = await prisma.auditLog.findMany({
      where: {
        action: 'DATA_EXPORT_GENERATED',
        actorId: 'anonymous',
      },
    });
    assert(unauthAuditLogs.length === 0, 'Unauthenticated rejected requests do NOT generate audit log events');

    // ---------------------------------------------------------
    // 9. Dedicated Per-User Rate Limiting & Quota Isolation (SEC-9A-01)
    // ---------------------------------------------------------
    // Create dedicated rate limit test user 1
    const rateLimitUser1 = await dataManager.createStudent({ tag: 'p9a_rl1' });
    const rlClient1 = createApiClient(baseUrl);
    rlClient1.loginAs(rateLimitUser1);

    // Exactly 5 consecutive requests must succeed with HTTP 200
    for (let i = 1; i <= 5; i++) {
      const rlRes = await rlClient1.request('GET', '/api/user/data-export');
      assert(rlRes.status === 200, `Rate-limit test user 1 request ${i}/5 succeeds with HTTP 200`);
    }

    // 6th consecutive request by User 1 MUST be rejected with HTTP 429
    const blockedRes = await rlClient1.request('GET', '/api/user/data-export');
    assert(blockedRes.status === 429, 'Rate-limit test user 1 request 6/5 is strictly rejected with HTTP 429 (SEC-9A-01)');
    assert(
      blockedRes.body?.error === 'Too many personal data export requests. Please try again after 15 minutes.',
      'HTTP 429 error message informs user of rate limit cooldown'
    );

    // Create separate dedicated rate limit test user 2 -> quota must be isolated per user
    const rateLimitUser2 = await dataManager.createStudent({ tag: 'p9a_rl2' });
    const rlClient2 = createApiClient(baseUrl);
    rlClient2.loginAs(rateLimitUser2);

    const user2Res = await rlClient2.request('GET', '/api/user/data-export');
    assert(user2Res.status === 200, 'Separate user 2 has independent quota and succeeds with HTTP 200 despite user 1 being limited (SEC-9A-01)');
    assert(user2Res.body.metadata.dataPrincipalId === rateLimitUser2.id, 'User 2 export strictly belongs to user 2');

  } finally {
    await dataManager.cleanup();
  }
}
