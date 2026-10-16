// tests/suites/auditLog.test.js — Phase 5B AuditLog Infrastructure & Activity Logging Suite
import { createApiClient, findLeakedSecrets, FORBIDDEN_SECRET_KEYS } from '../helpers/apiClient.js';
import { TestDataManager } from '../helpers/testData.js';

export async function runAuditLogTests(baseUrl, assert) {
  const dataManager = new TestDataManager();

  try {
    // ---------------------------------------------------------
    // 1. Prisma AuditLog Model Availability
    // ---------------------------------------------------------
    const initialLogCount = await dataManager.prisma.auditLog.count();
    assert(
      typeof initialLogCount === 'number',
      'AuditLog model is queryable via Prisma ORM',
      `AuditLog count: ${initialLogCount}`
    );

    // ---------------------------------------------------------
    // 2. Setup Personas
    // ---------------------------------------------------------
    const librarian = await dataManager.createLibrarian({ tag: 'aud_lib' });
    const librarianClient = createApiClient(baseUrl);
    librarianClient.loginAs(librarian);

    const student = await dataManager.createStudent({ tag: 'aud_stu' });
    const studentClient = createApiClient(baseUrl);
    studentClient.loginAs(student);

    // ---------------------------------------------------------
    // 3. Action: USER_CREATED
    // ---------------------------------------------------------
    const newTargetEmail = dataManager.generateEmail('STUDENT', 'target_aud');
    const newTargetRoll = dataManager.generateRollNumber('AUD');
    const rawPlainPassword = 'TargetUserSecurePass123!';

    const createUserRes = await librarianClient.request('POST', '/api/admin/users', {
      body: {
        name: 'Audit Target User',
        email: newTargetEmail,
        password: rawPlainPassword,
        role: 'STUDENT',
        rollNumber: newTargetRoll,
        program: 'BCOM',
        branch: 'General',
        year: 1,
        semester: 1,
      },
    });

    assert(
      createUserRes.status === 201,
      'POST /api/admin/users creates user with HTTP 201',
      `Got status ${createUserRes.status}`
    );

    const createdUserId = createUserRes.body?.user?.id;
    assert(!!createdUserId, 'Created user has valid UUID id', `ID: ${createdUserId}`);
    dataManager.createdUserIds.add(createdUserId);

    const userCreatedLog = await dataManager.prisma.auditLog.findFirst({
      where: { action: 'USER_CREATED', targetId: createdUserId },
    });

    assert(!!userCreatedLog, 'AuditLog recorded USER_CREATED action', `Found: ${!!userCreatedLog}`);
    assert(
      userCreatedLog?.actorId === librarian.id,
      'USER_CREATED AuditLog correctly captures librarian actorId',
      `Expected ${librarian.id}, got ${userCreatedLog?.actorId}`
    );
    assert(
      userCreatedLog?.targetId === createdUserId,
      'USER_CREATED AuditLog correctly captures created userId as targetId',
      `Expected ${createdUserId}, got ${userCreatedLog?.targetId}`
    );
    assert(
      userCreatedLog?.timestamp instanceof Date,
      'USER_CREATED AuditLog has valid timestamp Date',
      `Timestamp: ${userCreatedLog?.timestamp}`
    );

    const createdDetails = JSON.parse(userCreatedLog?.details || '{}');
    assert(
      createdDetails.email === newTargetEmail.toLowerCase(),
      'USER_CREATED details contains non-sensitive email metadata',
      `Email in details: ${createdDetails.email}`
    );
    assert(
      findLeakedSecrets(createdDetails).length === 0,
      'USER_CREATED details does not leak passwords, hashes or credentials',
      `Leaks found: ${findLeakedSecrets(createdDetails).join(', ')}`
    );
    assert(
      !userCreatedLog?.details?.includes(rawPlainPassword),
      'USER_CREATED details string does not contain raw plain password text',
      'Raw password found in details!'
    );

    // ---------------------------------------------------------
    // 4. Action: USER_UPDATED
    // ---------------------------------------------------------
    const updateUserRes = await librarianClient.request('PUT', `/api/admin/users/${createdUserId}`, {
      body: {
        name: 'Audit Target User (Updated)',
        phone: '9876543210',
      },
    });

    assert(
      updateUserRes.status === 200,
      'PUT /api/admin/users/:id updates profile with HTTP 200',
      `Got status ${updateUserRes.status}`
    );

    const userUpdatedLog = await dataManager.prisma.auditLog.findFirst({
      where: { action: 'USER_UPDATED', targetId: createdUserId },
      orderBy: { timestamp: 'desc' },
    });

    assert(!!userUpdatedLog, 'AuditLog recorded USER_UPDATED action', `Found: ${!!userUpdatedLog}`);
    assert(
      userUpdatedLog?.actorId === librarian.id,
      'USER_UPDATED AuditLog captures librarian actorId',
      `Got ${userUpdatedLog?.actorId}`
    );
    const updatedDetails = JSON.parse(userUpdatedLog?.details || '{}');
    assert(
      updatedDetails.name === 'Audit Target User (Updated)',
      'USER_UPDATED details contains updated non-sensitive name',
      `Name: ${updatedDetails.name}`
    );
    assert(
      findLeakedSecrets(updatedDetails).length === 0,
      'USER_UPDATED details does not leak secrets',
      `Leaks: ${findLeakedSecrets(updatedDetails).join(', ')}`
    );

    // ---------------------------------------------------------
    // 5. Action: USER_DEACTIVATED
    // ---------------------------------------------------------
    const deactivateRes = await librarianClient.request('PUT', `/api/admin/users/${createdUserId}`, {
      body: { active: false },
    });

    assert(
      deactivateRes.status === 200,
      'PUT /api/admin/users/:id deactivates user with HTTP 200',
      `Got status ${deactivateRes.status}`
    );

    const userDeactivatedLog = await dataManager.prisma.auditLog.findFirst({
      where: { action: 'USER_DEACTIVATED', targetId: createdUserId },
      orderBy: { timestamp: 'desc' },
    });

    assert(!!userDeactivatedLog, 'AuditLog recorded USER_DEACTIVATED action', `Found: ${!!userDeactivatedLog}`);
    assert(
      userDeactivatedLog?.actorId === librarian.id,
      'USER_DEACTIVATED AuditLog captures librarian actorId',
      `Got ${userDeactivatedLog?.actorId}`
    );
    const deactivatedDetails = JSON.parse(userDeactivatedLog?.details || '{}');
    assert(
      deactivatedDetails.active === false,
      'USER_DEACTIVATED details reflects active === false state',
      `Active: ${deactivatedDetails.active}`
    );

    // ---------------------------------------------------------
    // 6. Action: USER_ACTIVATED
    // ---------------------------------------------------------
    const activateRes = await librarianClient.request('PUT', `/api/admin/users/${createdUserId}`, {
      body: { active: true },
    });

    assert(
      activateRes.status === 200,
      'PUT /api/admin/users/:id reactivates user with HTTP 200',
      `Got status ${activateRes.status}`
    );

    const userActivatedLog = await dataManager.prisma.auditLog.findFirst({
      where: { action: 'USER_ACTIVATED', targetId: createdUserId },
      orderBy: { timestamp: 'desc' },
    });

    assert(!!userActivatedLog, 'AuditLog recorded USER_ACTIVATED action', `Found: ${!!userActivatedLog}`);
    assert(
      userActivatedLog?.actorId === librarian.id,
      'USER_ACTIVATED AuditLog captures librarian actorId',
      `Got ${userActivatedLog?.actorId}`
    );
    const activatedDetails = JSON.parse(userActivatedLog?.details || '{}');
    assert(
      activatedDetails.active === true,
      'USER_ACTIVATED details reflects active === true state',
      `Active: ${activatedDetails.active}`
    );

    // ---------------------------------------------------------
    // 7. Action: PASSWORD_RESET
    // ---------------------------------------------------------
    const resetPasswordRaw = 'BrandNewSuperSecretPass999!';
    const resetPasswordRes = await librarianClient.request('PUT', `/api/admin/users/${createdUserId}/reset-password`, {
      body: { newPassword: resetPasswordRaw },
    });

    assert(
      resetPasswordRes.status === 200,
      'PUT /api/admin/users/:id/reset-password resets password with HTTP 200',
      `Got status ${resetPasswordRes.status}`
    );

    const passwordResetLog = await dataManager.prisma.auditLog.findFirst({
      where: { action: 'PASSWORD_RESET', targetId: createdUserId },
      orderBy: { timestamp: 'desc' },
    });

    assert(!!passwordResetLog, 'AuditLog recorded PASSWORD_RESET action', `Found: ${!!passwordResetLog}`);
    assert(
      passwordResetLog?.actorId === librarian.id,
      'PASSWORD_RESET AuditLog captures librarian actorId',
      `Got ${passwordResetLog?.actorId}`
    );
    assert(
      passwordResetLog?.targetId === createdUserId,
      'PASSWORD_RESET AuditLog captures target userId',
      `Got ${passwordResetLog?.targetId}`
    );

    const pwdResetDetails = JSON.parse(passwordResetLog?.details || '{}');
    assert(
      findLeakedSecrets(pwdResetDetails).length === 0,
      'PASSWORD_RESET details object has zero leaked password/hash keys',
      `Leaks: ${findLeakedSecrets(pwdResetDetails).join(', ')}`
    );
    assert(
      !passwordResetLog?.details?.includes(resetPasswordRaw),
      'PASSWORD_RESET details string does NOT contain raw new password',
      'Plaintext password found in AuditLog details!'
    );

    // ---------------------------------------------------------
    // 8. Action: USER_DELETED
    // ---------------------------------------------------------
    const deleteUserRes = await librarianClient.request('DELETE', `/api/admin/users/${createdUserId}`);
    assert(
      deleteUserRes.status === 200,
      'DELETE /api/admin/users/:id deletes user with HTTP 200',
      `Got status ${deleteUserRes.status}`
    );

    const userDeletedLog = await dataManager.prisma.auditLog.findFirst({
      where: { action: 'USER_DELETED', targetId: createdUserId },
      orderBy: { timestamp: 'desc' },
    });

    assert(!!userDeletedLog, 'AuditLog recorded USER_DELETED action', `Found: ${!!userDeletedLog}`);
    assert(
      userDeletedLog?.actorId === librarian.id,
      'USER_DELETED AuditLog captures librarian actorId',
      `Got ${userDeletedLog?.actorId}`
    );
    assert(
      userDeletedLog?.targetId === createdUserId,
      'USER_DELETED AuditLog preserves targetId of deleted user',
      `Got ${userDeletedLog?.targetId}`
    );

    // ---------------------------------------------------------
    // 9. Action: BOOK_CREATED
    // ---------------------------------------------------------
    const createBookRes = await librarianClient.request('POST', '/api/books', {
      body: {
        title: 'Financial Accounting & Auditing Vol. 1',
        author: 'Prof. K. R. Sharma',
        isbn: `978-81-${Math.floor(100000 + Math.random() * 900000)}-0`,
        category: 'TEXTBOOK',
        segment: 'Accounting',
        totalCopies: 2,
        shelfLocation: 'A-1-05',
      },
    });

    assert(
      createBookRes.status === 201,
      'POST /api/books creates book with HTTP 201',
      `Got status ${createBookRes.status}`
    );

    const createdBookId = createBookRes.body?.book?.id;
    assert(!!createdBookId, 'Created book has valid id', `ID: ${createdBookId}`);
    dataManager.createdBookIds.add(createdBookId);

    const bookCreatedLog = await dataManager.prisma.auditLog.findFirst({
      where: { action: 'BOOK_CREATED', targetId: createdBookId },
    });

    assert(!!bookCreatedLog, 'AuditLog recorded BOOK_CREATED action', `Found: ${!!bookCreatedLog}`);
    assert(
      bookCreatedLog?.actorId === librarian.id,
      'BOOK_CREATED AuditLog captures librarian actorId',
      `Got ${bookCreatedLog?.actorId}`
    );
    assert(
      bookCreatedLog?.targetId === createdBookId,
      'BOOK_CREATED AuditLog captures bookId as targetId',
      `Got ${bookCreatedLog?.targetId}`
    );

    const bookCreatedDetails = JSON.parse(bookCreatedLog?.details || '{}');
    assert(
      bookCreatedDetails.title === 'Financial Accounting & Auditing Vol. 1',
      'BOOK_CREATED details contains book title',
      `Title: ${bookCreatedDetails.title}`
    );
    assert(
      findLeakedSecrets(bookCreatedDetails).length === 0,
      'BOOK_CREATED details contains zero sensitive keys',
      'Leaks found'
    );

    // ---------------------------------------------------------
    // 10. Action: BOOK_UPDATED
    // ---------------------------------------------------------
    const updateBookRes = await librarianClient.request('PUT', `/api/books/${createdBookId}`, {
      body: {
        title: 'Financial Accounting & Auditing Vol. 1 (Revised 2nd Ed.)',
        edition: '2nd Edition',
      },
    });

    assert(
      updateBookRes.status === 200,
      'PUT /api/books/:id updates book with HTTP 200',
      `Got status ${updateBookRes.status}`
    );

    const bookUpdatedLog = await dataManager.prisma.auditLog.findFirst({
      where: { action: 'BOOK_UPDATED', targetId: createdBookId },
      orderBy: { timestamp: 'desc' },
    });

    assert(!!bookUpdatedLog, 'AuditLog recorded BOOK_UPDATED action', `Found: ${!!bookUpdatedLog}`);
    assert(
      bookUpdatedLog?.actorId === librarian.id,
      'BOOK_UPDATED AuditLog captures librarian actorId',
      `Got ${bookUpdatedLog?.actorId}`
    );
    const bookUpdatedDetails = JSON.parse(bookUpdatedLog?.details || '{}');
    assert(
      bookUpdatedDetails.title === 'Financial Accounting & Auditing Vol. 1 (Revised 2nd Ed.)',
      'BOOK_UPDATED details contains revised title',
      `Title: ${bookUpdatedDetails.title}`
    );

    // ---------------------------------------------------------
    // 11. Action: BOOK_COPY_UPDATED
    // ---------------------------------------------------------
    const bookCopies = createBookRes.body?.book?.copies || [];
    assert(bookCopies.length > 0, 'Book has physical copies created', `Count: ${bookCopies.length}`);
    const firstCopyId = bookCopies[0].id;

    const updateCopyRes = await librarianClient.request('PUT', `/api/books/copies/${firstCopyId}`, {
      body: {
        condition: 'Fair',
        status: 'DAMAGED',
        barcode: `BC-${Date.now()}`,
      },
    });

    assert(
      updateCopyRes.status === 200,
      'PUT /api/books/copies/:copyId updates copy with HTTP 200',
      `Got status ${updateCopyRes.status}`
    );

    const copyUpdatedLog = await dataManager.prisma.auditLog.findFirst({
      where: { action: 'BOOK_COPY_UPDATED', targetId: firstCopyId },
      orderBy: { timestamp: 'desc' },
    });

    assert(!!copyUpdatedLog, 'AuditLog recorded BOOK_COPY_UPDATED action', `Found: ${!!copyUpdatedLog}`);
    assert(
      copyUpdatedLog?.actorId === librarian.id,
      'BOOK_COPY_UPDATED AuditLog captures librarian actorId',
      `Got ${copyUpdatedLog?.actorId}`
    );
    assert(
      copyUpdatedLog?.targetId === firstCopyId,
      'BOOK_COPY_UPDATED AuditLog captures copyId as targetId',
      `Got ${copyUpdatedLog?.targetId}`
    );

    const copyUpdatedDetails = JSON.parse(copyUpdatedLog?.details || '{}');
    assert(
      copyUpdatedDetails.previousStatus === 'AVAILABLE' && copyUpdatedDetails.newStatus === 'DAMAGED',
      'BOOK_COPY_UPDATED details records status transition from AVAILABLE to DAMAGED',
      `Transition: ${copyUpdatedDetails.previousStatus} -> ${copyUpdatedDetails.newStatus}`
    );

    // ---------------------------------------------------------
    // 12. Action: BOOK_DELETED
    // ---------------------------------------------------------
    // Reset copy status so no issued constraint prevents deletion
    const deleteBookRes = await librarianClient.request('DELETE', `/api/books/${createdBookId}`);
    assert(
      deleteBookRes.status === 200,
      'DELETE /api/books/:id deletes book with HTTP 200',
      `Got status ${deleteBookRes.status}`
    );

    const bookDeletedLog = await dataManager.prisma.auditLog.findFirst({
      where: { action: 'BOOK_DELETED', targetId: createdBookId },
      orderBy: { timestamp: 'desc' },
    });

    assert(!!bookDeletedLog, 'AuditLog recorded BOOK_DELETED action', `Found: ${!!bookDeletedLog}`);
    assert(
      bookDeletedLog?.actorId === librarian.id,
      'BOOK_DELETED AuditLog captures librarian actorId',
      `Got ${bookDeletedLog?.actorId}`
    );
    assert(
      bookDeletedLog?.targetId === createdBookId,
      'BOOK_DELETED AuditLog captures bookId as targetId',
      `Got ${bookDeletedLog?.targetId}`
    );

    // ---------------------------------------------------------
    // 13. Security & RBAC: Non-librarians Cannot Trigger Administrative Audit Events
    // ---------------------------------------------------------
    const unauthorizedCreate = await studentClient.request('POST', '/api/admin/users', {
      body: {
        name: 'Hacker User',
        email: 'hacker@example.test',
        password: 'Password123!',
        role: 'LIBRARIAN',
      },
    });

    assert(
      unauthorizedCreate.status === 403,
      'Student is forbidden from POST /api/admin/users with HTTP 403',
      `Got status ${unauthorizedCreate.status}`
    );

    const forbiddenAuditLog = await dataManager.prisma.auditLog.findFirst({
      where: { actorId: student.id },
    });

    assert(
      forbiddenAuditLog === null,
      'Rejected unauthorized requests do NOT generate audit log entries',
      `Unexpected log found: ${JSON.stringify(forbiddenAuditLog)}`
    );

    // ---------------------------------------------------------
    // 14. Comprehensive Table Integrity & Scrubbing Verification
    // ---------------------------------------------------------
    const allSessionLogs = await dataManager.prisma.auditLog.findMany({
      where: { actorId: librarian.id },
    });

    assert(
      allSessionLogs.length >= 10,
      'At least 10 distinct audit logs were generated and verified during test lifecycle',
      `Total logs found: ${allSessionLogs.length}`
    );

    let foundAnySecretLeak = false;
    for (const log of allSessionLogs) {
      if (log.details) {
        const detailsObj = JSON.parse(log.details);
        const leaks = findLeakedSecrets(detailsObj);
        if (leaks.length > 0) {
          foundAnySecretLeak = true;
          break;
        }
      }
    }

    assert(
      !foundAnySecretLeak,
      'Global scan across all generated session audit logs confirms ZERO secret leaks',
      `Leaked secrets detected: ${foundAnySecretLeak}`
    );
  } finally {
    await dataManager.cleanup();
  }
}
