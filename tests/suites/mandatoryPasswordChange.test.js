// tests/suites/mandatoryPasswordChange.test.js — Phase 9B Mandatory First-Login Password Change Suite
import bcrypt from 'bcryptjs';
import { createApiClient, findLeakedSecrets } from '../helpers/apiClient.js';
import { TestDataManager } from '../helpers/testData.js';

export async function runMandatoryPasswordChangeTests(baseUrl, assert) {
  const dataManager = new TestDataManager();
  const prisma = dataManager.prisma;

  try {
    // ---------------------------------------------------------
    // 1. Database Schema & Default Behavior
    // ---------------------------------------------------------
    // 1.1 New user created without mustChangePassword defaults to false
    const normalStudent = await dataManager.createStudent({ tag: 'p9b_norm' });
    const normalUserRecord = await prisma.user.findUnique({
      where: { id: normalStudent.id },
      select: { id: true, mustChangePassword: true },
    });
    assert(
      normalUserRecord.mustChangePassword === false,
      'New user record defaults mustChangePassword to false in database'
    );

    // 1.2 User explicitly created with mustChangePassword = true is persisted accurately
    const flaggedStudent = await dataManager.createStudent({
      tag: 'p9b_flag',
      mustChangePassword: true,
    });
    const flaggedUserRecord = await prisma.user.findUnique({
      where: { id: flaggedStudent.id },
      select: { id: true, mustChangePassword: true },
    });
    assert(
      flaggedUserRecord.mustChangePassword === true,
      'User created with mustChangePassword: true is accurately persisted in database'
    );

    // ---------------------------------------------------------
    // 2. Normal Account Retains Full Access (mustChangePassword = false)
    // ---------------------------------------------------------
    const normalClient = createApiClient(baseUrl);
    const normalLoginRes = await normalClient.login(normalStudent.email, normalStudent.plainPassword);
    assert(normalLoginRes.status === 200, 'Normal student login succeeds with HTTP 200');
    assert(
      normalLoginRes.body?.user?.mustChangePassword === false,
      'Normal student login response reports mustChangePassword: false'
    );

    // Normal student can access catalog and lending
    const normalBooksRes = await normalClient.request('GET', '/api/books');
    assert(normalBooksRes.status === 200, 'Normal student can access GET /api/books (HTTP 200)');

    const normalLoansRes = await normalClient.request('GET', '/api/lending/my-books');
    assert(normalLoansRes.status === 200, 'Normal student can access GET /api/lending/my-books (HTTP 200)');

    // ---------------------------------------------------------
    // 3. Flagged Account Is Strictly Blocked From Protected Features
    // ---------------------------------------------------------
    const flaggedClient = createApiClient(baseUrl);
    const flaggedLoginRes = await flaggedClient.login(flaggedStudent.email, flaggedStudent.plainPassword);
    assert(flaggedLoginRes.status === 200, 'Flagged student login succeeds with HTTP 200');
    assert(
      flaggedLoginRes.body?.user?.mustChangePassword === true,
      'Flagged student login response reports mustChangePassword: true'
    );

    // 3.1 Direct API access to /api/books is blocked
    const blockedBooksRes = await flaggedClient.request('GET', '/api/books');
    assert(
      blockedBooksRes.status === 403,
      'Flagged user GET /api/books is strictly rejected with HTTP 403'
    );
    assert(
      blockedBooksRes.body?.code === 'PASSWORD_CHANGE_REQUIRED',
      'Blocked books error response specifies code PASSWORD_CHANGE_REQUIRED'
    );
    assert(
      blockedBooksRes.body?.mustChangePassword === true,
      'Blocked books error response contains mustChangePassword: true flag'
    );

    // 3.2 Direct API access to /api/lending/my-books is blocked
    const blockedLoansRes = await flaggedClient.request('GET', '/api/lending/my-books');
    assert(
      blockedLoansRes.status === 403,
      'Flagged user GET /api/lending/my-books is strictly rejected with HTTP 403'
    );
    assert(
      blockedLoansRes.body?.code === 'PASSWORD_CHANGE_REQUIRED',
      'Blocked loans error response specifies code PASSWORD_CHANGE_REQUIRED'
    );

    // 3.3 Direct API access to /api/lending/request-borrow is blocked
    const blockedBorrowRes = await flaggedClient.request('POST', '/api/lending/request-borrow', {
      body: { bookId: 'synthetic-book-id' },
    });
    assert(
      blockedBorrowRes.status === 403,
      'Flagged user POST /api/lending/request-borrow is strictly rejected with HTTP 403'
    );

    // 3.4 Direct API access to /api/user/data-export is blocked
    const blockedExportRes = await flaggedClient.request('GET', '/api/user/data-export');
    assert(
      blockedExportRes.status === 403,
      'Flagged user GET /api/user/data-export is strictly rejected with HTTP 403'
    );

    // ---------------------------------------------------------
    // 4. Minimum Permitted Endpoints for Flagged Account
    // ---------------------------------------------------------
    // 4.1 GET /api/auth/me remains accessible to identify password change requirement
    const meRes = await flaggedClient.request('GET', '/api/auth/me');
    assert(meRes.status === 200, 'Flagged user GET /api/auth/me succeeds with HTTP 200');
    assert(
      meRes.body?.user?.mustChangePassword === true,
      'GET /api/auth/me returns mustChangePassword: true for flagged user'
    );

    // 4.2 GET /api/user/profile remains accessible
    const profileRes = await flaggedClient.request('GET', '/api/user/profile');
    assert(profileRes.status === 200, 'Flagged user GET /api/user/profile succeeds with HTTP 200');
    assert(
      profileRes.body?.user?.mustChangePassword === true,
      'GET /api/user/profile returns mustChangePassword: true for flagged user'
    );

    // 4.3 Profile update tampering defense: user cannot clear mustChangePassword via profile update
    const tamperRes = await flaggedClient.request('PUT', '/api/user/profile', {
      body: { mustChangePassword: false },
    });
    assert(
      tamperRes.status === 403,
      'PUT /api/user/profile tampering with mustChangePassword is strictly rejected with HTTP 403'
    );

    // 4.4 POST /api/auth/logout remains accessible
    const tempLogoutClient = createApiClient(baseUrl);
    const tempUser = await dataManager.createStudent({ tag: 'p9b_tlg', mustChangePassword: true });
    await tempLogoutClient.login(tempUser.email, tempUser.plainPassword);
    const logoutRes = await tempLogoutClient.request('POST', '/api/auth/logout');
    assert(logoutRes.status === 200, 'Flagged user POST /api/auth/logout succeeds with HTTP 200');

    // ---------------------------------------------------------
    // 5. Password Change Validation & Security Rules
    // ---------------------------------------------------------
    // 5.1 Incorrect current password is rejected
    const wrongCurrentRes = await flaggedClient.request('PUT', '/api/auth/change-password', {
      body: {
        currentPassword: 'IncorrectOldPassword999!',
        newPassword: 'BrandNewSecurePassword123!',
      },
    });
    assert(
      wrongCurrentRes.status === 401,
      'Change password with incorrect current password is rejected with HTTP 401'
    );
    assert(
      wrongCurrentRes.body?.error === 'Current password is incorrect.',
      'Error message specifies current password is incorrect'
    );

    // Verify flag was NOT prematurely cleared in DB
    const stillFlaggedAfterFailed = await prisma.user.findUnique({
      where: { id: flaggedStudent.id },
      select: { mustChangePassword: true },
    });
    assert(
      stillFlaggedAfterFailed.mustChangePassword === true,
      'mustChangePassword remains true after rejected current password attempt'
    );

    // 5.2 Password shorter than 8 characters is rejected
    const shortNewRes = await flaggedClient.request('PUT', '/api/auth/change-password', {
      body: {
        currentPassword: flaggedStudent.plainPassword,
        newPassword: 'short',
      },
    });
    assert(
      shortNewRes.status === 400,
      'Change password with new password < 8 chars is rejected with HTTP 400'
    );

    // 5.3 Password identical to current password is rejected
    const samePasswordRes = await flaggedClient.request('PUT', '/api/auth/change-password', {
      body: {
        currentPassword: flaggedStudent.plainPassword,
        newPassword: flaggedStudent.plainPassword,
      },
    });
    assert(
      samePasswordRes.status === 400,
      'Change password with identical new password is rejected with HTTP 400'
    );

    // ---------------------------------------------------------
    // 6. Successful Atomic Password Change & Clearance
    // ---------------------------------------------------------
    const oldCookieBeforeChange = flaggedClient.token;
    const newSecurePassword = 'NewPermanentPassword888!';

    const successfulChangeRes = await flaggedClient.request('PUT', '/api/auth/change-password', {
      body: {
        currentPassword: flaggedStudent.plainPassword,
        newPassword: newSecurePassword,
      },
    });
    assert(
      successfulChangeRes.status === 200,
      'Valid password change request succeeds with HTTP 200'
    );
    assert(
      successfulChangeRes.body?.user?.mustChangePassword === false,
      'Successful password change response returns user with mustChangePassword: false'
    );

    // Verify zero secret leakage in password change response
    const leaks = findLeakedSecrets(successfulChangeRes.body);
    assert(
      leaks.length === 0,
      `Password change response contains zero secret leaks (found: ${leaks.join(', ')})`
    );

    // Verify database record updated atomically
    const updatedUserInDb = await prisma.user.findUnique({
      where: { id: flaggedStudent.id },
    });
    assert(
      updatedUserInDb.mustChangePassword === false,
      'Database mustChangePassword field was atomically cleared to false'
    );
    assert(
      updatedUserInDb.password !== flaggedStudent.plainPassword,
      'Password hash is not the plaintext old password'
    );
    assert(
      updatedUserInDb.password !== newSecurePassword,
      'Password hash is not the plaintext new password'
    );

    const isBcryptHash = await bcrypt.compare(newSecurePassword, updatedUserInDb.password);
    assert(
      isBcryptHash === true,
      'Database password was updated to a valid bcrypt hash of the new password'
    );

    // ---------------------------------------------------------
    // 7. Session Invalidation & Post-Change Unblocked Access
    // ---------------------------------------------------------
    // 7.1 Verify old session token from before the password change is rejected (tokenVersion incremented)
    const unauthClient = createApiClient(baseUrl);
    const staleSessionRes = await unauthClient.request('GET', '/api/auth/me', {
      cookie: oldCookieBeforeChange,
    });
    assert(
      staleSessionRes.status === 401,
      'Pre-change session token is revoked after password change (HTTP 401)'
    );

    // 7.2 Login with old password fails
    const oldLoginAttempt = await unauthClient.login(flaggedStudent.email, flaggedStudent.plainPassword);
    assert(
      oldLoginAttempt.status === 401,
      'Login with old temporary password fails with HTTP 401'
    );

    // 7.3 Login with new password succeeds
    const newLoginAttempt = await unauthClient.login(flaggedStudent.email, newSecurePassword);
    assert(
      newLoginAttempt.status === 200,
      'Login with new permanent password succeeds with HTTP 200'
    );
    assert(
      newLoginAttempt.body?.user?.mustChangePassword === false,
      'New login session reports mustChangePassword: false'
    );

    // 7.4 After password change, user can now access previously blocked protected routes
    const unblockedBooksRes = await unauthClient.request('GET', '/api/books');
    assert(
      unblockedBooksRes.status === 200,
      'User can now access GET /api/books with HTTP 200 after password change'
    );

    const unblockedLoansRes = await unauthClient.request('GET', '/api/lending/my-books');
    assert(
      unblockedLoansRes.status === 200,
      'User can now access GET /api/lending/my-books with HTTP 200 after password change'
    );

    // ---------------------------------------------------------
    // 8. Cross-User Immunity (IDOR Protection)
    // ---------------------------------------------------------
    const victimStudent = await dataManager.createStudent({
      tag: 'p9b_vic',
      mustChangePassword: true,
    });
    const attackerClient = unauthClient; // authenticated as flaggedStudent

    // Attacker attempts to change victim's password by supplying victim's userId in body
    const idorChangeRes = await attackerClient.request('PUT', '/api/auth/change-password', {
      body: {
        userId: victimStudent.id,
        currentPassword: 'AttackerPasswordWrong!',
        newPassword: 'AttackerHijackPassword999!',
      },
    });
    // The request targets the attacker's own session and checks attacker's password
    assert(
      idorChangeRes.status === 401,
      'IDOR attempt is evaluated strictly against attacker session and rejected (HTTP 401)'
    );

    // Confirm victim was untouched in DB
    const victimAfterAttack = await prisma.user.findUnique({
      where: { id: victimStudent.id },
    });
    assert(
      victimAfterAttack.mustChangePassword === true,
      'Victim mustChangePassword flag remains unchanged after external tamper attempt'
    );
    const victimPlainStillValid = await bcrypt.compare(
      victimStudent.plainPassword,
      victimAfterAttack.password
    );
    assert(
      victimPlainStillValid === true,
      'Victim password hash in database remains completely unmodified'
    );

    // ---------------------------------------------------------
    // 9. Persona Coverage (Teacher & Librarian Enforcement)
    // ---------------------------------------------------------
    // 9.1 Flagged Teacher account is blocked from teacher features
    const flaggedTeacher = await dataManager.createTeacher({
      tag: 'p9b_tch',
      mustChangePassword: true,
    });
    const teacherClient = createApiClient(baseUrl);
    await teacherClient.login(flaggedTeacher.email, flaggedTeacher.plainPassword);

    const teacherBlockedRes = await teacherClient.request('GET', '/api/lending/all');
    assert(
      teacherBlockedRes.status === 403,
      'Flagged teacher is blocked from GET /api/lending/all (HTTP 403)'
    );
    assert(
      teacherBlockedRes.body?.code === 'PASSWORD_CHANGE_REQUIRED',
      'Teacher block specifies code PASSWORD_CHANGE_REQUIRED'
    );

    // 9.2 Flagged Librarian account is blocked from administrative features
    const flaggedLibrarian = await dataManager.createLibrarian({
      tag: 'p9b_lib',
      mustChangePassword: true,
    });
    const librarianClient = createApiClient(baseUrl);
    await librarianClient.login(flaggedLibrarian.email, flaggedLibrarian.plainPassword);

    const librarianBlockedUsersRes = await librarianClient.request('GET', '/api/admin/users');
    assert(
      librarianBlockedUsersRes.status === 403,
      'Flagged librarian is blocked from GET /api/admin/users (HTTP 403)'
    );
    assert(
      librarianBlockedUsersRes.body?.code === 'PASSWORD_CHANGE_REQUIRED',
      'Librarian block specifies code PASSWORD_CHANGE_REQUIRED'
    );

    const librarianBlockedDashboardRes = await librarianClient.request('GET', '/api/admin/dashboard');
    assert(
      librarianBlockedDashboardRes.status === 403,
      'Flagged librarian is blocked from GET /api/admin/dashboard (HTTP 403)'
    );
    assert(
      librarianBlockedDashboardRes.body?.code === 'PASSWORD_CHANGE_REQUIRED',
      'Librarian dashboard block specifies code PASSWORD_CHANGE_REQUIRED'
    );

  } finally {
    await dataManager.cleanup();
  }
}
