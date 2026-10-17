// tests/suites/userHardening.test.js — Phase 5C User Management Hardening & Administrative Protection Suite
import { createApiClient } from '../helpers/apiClient.js';
import { TestDataManager } from '../helpers/testData.js';

export async function runUserHardeningTests(baseUrl, assert) {
  const dataManager = new TestDataManager();

  try {
    // ---------------------------------------------------------
    // 1. Setup Test Personas
    // ---------------------------------------------------------
    const primaryLibrarian = await dataManager.createLibrarian({ tag: 'uh_primary' });
    const primaryClient = createApiClient(baseUrl);
    primaryClient.loginAs(primaryLibrarian);

    const secondaryLibrarian = await dataManager.createLibrarian({ tag: 'uh_secondary' });
    const secondaryClient = createApiClient(baseUrl);
    secondaryClient.loginAs(secondaryLibrarian);

    const testStudent = await dataManager.createStudent({ tag: 'uh_student' });
    const studentClient = createApiClient(baseUrl);
    studentClient.loginAs(testStudent);

    // ---------------------------------------------------------
    // 2. Self-Protection Guards (HTTP 400)
    // ---------------------------------------------------------
    // 2a. Self-deactivation rejection
    const selfDeactivateRes = await primaryClient.request('PUT', `/api/admin/users/${primaryLibrarian.id}`, {
      body: { active: false },
    });

    assert(
      selfDeactivateRes.status === 400,
      'PUT /api/admin/users/:id rejects self-deactivation with HTTP 400',
      `Got status ${selfDeactivateRes.status}`
    );
    assert(
      selfDeactivateRes.body?.error?.includes('Cannot deactivate your own account'),
      'Self-deactivation error message explicitly explains restriction',
      `Error: ${selfDeactivateRes.body?.error}`
    );

    const selfAfterDeactivateAttempt = await dataManager.prisma.user.findUnique({
      where: { id: primaryLibrarian.id },
      select: { active: true, role: true },
    });
    assert(
      selfAfterDeactivateAttempt?.active === true,
      'Primary librarian account remains active after rejected self-deactivation',
      `Active: ${selfAfterDeactivateAttempt?.active}`
    );

    // 2b. Self-demotion rejection (e.g. changing role to STUDENT or TEACHER)
    const selfDemoteRes = await primaryClient.request('PUT', `/api/admin/users/${primaryLibrarian.id}`, {
      body: { role: 'STUDENT' },
    });

    assert(
      selfDemoteRes.status === 400,
      'PUT /api/admin/users/:id rejects self-demotion with HTTP 400',
      `Got status ${selfDemoteRes.status}`
    );
    assert(
      selfDemoteRes.body?.error?.includes('Cannot demote your own account from LIBRARIAN role'),
      'Self-demotion error message explicitly explains restriction',
      `Error: ${selfDemoteRes.body?.error}`
    );

    const selfAfterDemoteAttempt = await dataManager.prisma.user.findUnique({
      where: { id: primaryLibrarian.id },
      select: { role: true },
    });
    assert(
      selfAfterDemoteAttempt?.role === 'LIBRARIAN',
      'Primary librarian role remains LIBRARIAN after rejected self-demotion',
      `Role: ${selfAfterDemoteAttempt?.role}`
    );

    // 2c. Self-deletion rejection
    const selfDeleteRes = await primaryClient.request('DELETE', `/api/admin/users/${primaryLibrarian.id}`);
    assert(
      selfDeleteRes.status === 400,
      'DELETE /api/admin/users/:id rejects self-deletion with HTTP 400',
      `Got status ${selfDeleteRes.status}`
    );
    assert(
      selfDeleteRes.body?.error?.includes('Cannot delete your own account'),
      'Self-deletion error message explains restriction',
      `Error: ${selfDeleteRes.body?.error}`
    );

    // ---------------------------------------------------------
    // 3. Multi-Librarian Mutations When Capacity Allows (HTTP 200)
    // ---------------------------------------------------------
    // When multiple active librarians exist, primary librarian can deactivate secondary librarian
    const deactivateSecondaryRes = await primaryClient.request('PUT', `/api/admin/users/${secondaryLibrarian.id}`, {
      body: { active: false },
    });

    assert(
      deactivateSecondaryRes.status === 200,
      'Primary librarian successfully deactivates secondary librarian when multiple exist (HTTP 200)',
      `Got status ${deactivateSecondaryRes.status}`
    );

    const secondaryInDb = await dataManager.prisma.user.findUnique({
      where: { id: secondaryLibrarian.id },
      select: { active: true, tokenVersion: true },
    });
    assert(
      secondaryInDb?.active === false,
      'Secondary librarian active status is false in database',
      `Active: ${secondaryInDb?.active}`
    );
    assert(
      secondaryInDb?.tokenVersion > secondaryLibrarian.tokenVersion,
      'Deactivating librarian atomically bumped their tokenVersion',
      `Initial: ${secondaryLibrarian.tokenVersion}, Now: ${secondaryInDb?.tokenVersion}`
    );

    // Secondary librarian's revoked session should now be rejected by API
    const secondaryActionRes = await secondaryClient.request('GET', '/api/admin/dashboard');
    assert(
      secondaryActionRes.status === 401,
      'Deactivated librarian existing session is immediately rejected with HTTP 401',
      `Got status ${secondaryActionRes.status}`
    );

    // Reactivate secondary librarian
    const reactivateSecondaryRes = await primaryClient.request('PUT', `/api/admin/users/${secondaryLibrarian.id}`, {
      body: { active: true },
    });
    assert(
      reactivateSecondaryRes.status === 200,
      'Primary librarian successfully reactivates secondary librarian (HTTP 200)',
      `Got status ${reactivateSecondaryRes.status}`
    );

    // ---------------------------------------------------------
    // 4. Last Active Librarian Safeguards (HTTP 400 via Advisory Lock)
    // ---------------------------------------------------------
    // To strictly test the last active librarian boundary:
    // Query how many active librarians currently exist
    const allActiveLibrarians = await dataManager.prisma.user.findMany({
      where: { role: 'LIBRARIAN', active: true },
      select: { id: true },
    });

    // Temporarily deactivate all other active librarians except secondaryLibrarian
    const otherLibrarianIds = allActiveLibrarians
      .map((l) => l.id)
      .filter((id) => id !== secondaryLibrarian.id);

    await dataManager.prisma.user.updateMany({
      where: { id: { in: otherLibrarianIds } },
      data: { active: false },
    });

    try {
      // Now secondaryLibrarian is the sole active librarian in the entire system.
      const freshSecondaryLogin = await secondaryClient.login(
        secondaryLibrarian.email,
        secondaryLibrarian.plainPassword
      );
      assert(
        freshSecondaryLogin.status === 200,
        'Secondary librarian logs in successfully as sole active librarian (HTTP 200)',
        `Status: ${freshSecondaryLogin.status}`
      );

      // Attempt 4a: Deactivate sole active librarian (self-deactivation check also guards, but target check applies)
      // Even if another administrative client attempted it:
      const soleDeactivateRes = await secondaryClient.request('PUT', `/api/admin/users/${secondaryLibrarian.id}`, {
        body: { active: false },
      });
      assert(
        soleDeactivateRes.status === 400,
        'Cannot deactivate sole active librarian (HTTP 400)',
        `Got status ${soleDeactivateRes.status}`
      );

      // Attempt 4b: Demote sole active librarian
      const soleDemoteRes = await secondaryClient.request('PUT', `/api/admin/users/${secondaryLibrarian.id}`, {
        body: { role: 'TEACHER' },
      });
      assert(
        soleDemoteRes.status === 400,
        'Cannot demote sole active librarian (HTTP 400)',
        `Got status ${soleDemoteRes.status}`
      );

      // Attempt 4c: Delete sole active librarian
      const soleDeleteRes = await secondaryClient.request('DELETE', `/api/admin/users/${secondaryLibrarian.id}`);
      assert(
        soleDeleteRes.status === 400,
        'Cannot delete sole active librarian (HTTP 400)',
        `Got status ${soleDeleteRes.status}`
      );
    } finally {
      // Restore other librarians active status
      await dataManager.prisma.user.updateMany({
        where: { id: { in: otherLibrarianIds } },
        data: { active: true },
      });
    }

    // ---------------------------------------------------------
    // 5. Session Invalidation on Role Change
    // ---------------------------------------------------------
    const initialStudentVersion = testStudent.tokenVersion;

    // Student makes valid call before role change
    const preRoleChangeRes = await studentClient.request('GET', '/api/books');
    assert(
      preRoleChangeRes.status === 200,
      'Student can browse catalog before role modification (HTTP 200)',
      `Got status ${preRoleChangeRes.status}`
    );

    // Librarian promotes student to TEACHER
    const promoteRes = await primaryClient.request('PUT', `/api/admin/users/${testStudent.id}`, {
      body: { role: 'TEACHER' },
    });
    assert(
      promoteRes.status === 200,
      'Librarian successfully promotes student to TEACHER (HTTP 200)',
      `Got status ${promoteRes.status}`
    );

    const studentAfterPromotion = await dataManager.prisma.user.findUnique({
      where: { id: testStudent.id },
      select: { role: true, tokenVersion: true },
    });
    assert(
      studentAfterPromotion?.role === 'TEACHER',
      'Target user role updated to TEACHER in database',
      `Role: ${studentAfterPromotion?.role}`
    );
    assert(
      studentAfterPromotion?.tokenVersion === initialStudentVersion + 1,
      'Target user tokenVersion incremented atomically (+1)',
      `Before: ${initialStudentVersion}, After: ${studentAfterPromotion?.tokenVersion}`
    );

    // Old student session token MUST be rejected immediately (HTTP 401)
    const postRoleOldTokenRes = await studentClient.request('GET', '/api/books');
    assert(
      postRoleOldTokenRes.status === 401,
      'Previous session token rejected immediately after role change (HTTP 401)',
      `Got status ${postRoleOldTokenRes.status}`
    );
    assert(
      postRoleOldTokenRes.body?.error?.includes('Session has been revoked') || postRoleOldTokenRes.body?.error?.includes('Invalid or expired token'),
      'Session revocation error returned to client',
      `Error: ${postRoleOldTokenRes.body?.error}`
    );

    // Logging in again issues a valid session with new tokenVersion
    const reLoginRes = await studentClient.login(
      testStudent.email,
      testStudent.plainPassword
    );
    assert(
      reLoginRes.status === 200,
      'Re-authenticating issues fresh JWT with updated tokenVersion (HTTP 200)',
      `Got status ${reLoginRes.status}`
    );

    const newSessionRes = await studentClient.request('GET', '/api/books');
    assert(
      newSessionRes.status === 200,
      'Fresh session with new tokenVersion can access protected routes (HTTP 200)',
      `Got status ${newSessionRes.status}`
    );

    // ---------------------------------------------------------
    // 6. AuditLog Verification for User Management Operations
    // ---------------------------------------------------------
    // Role change should be logged under USER_UPDATED
    const roleChangeAudit = await dataManager.prisma.auditLog.findFirst({
      where: { action: 'USER_UPDATED', targetId: testStudent.id },
      orderBy: { timestamp: 'desc' },
    });
    assert(
      !!roleChangeAudit,
      'AuditLog recorded USER_UPDATED for role transition',
      `Found: ${!!roleChangeAudit}`
    );
    assert(
      roleChangeAudit?.actorId === primaryLibrarian.id,
      'AuditLog captures primary librarian actorId',
      `Expected: ${primaryLibrarian.id}, got: ${roleChangeAudit?.actorId}`
    );

    // Verify rejected self-demotion did NOT create an AuditLog entry
    const rejectedAudit = await dataManager.prisma.auditLog.findFirst({
      where: {
        actorId: primaryLibrarian.id,
        targetId: primaryLibrarian.id,
        action: 'USER_UPDATED',
      },
    });
    assert(
      !rejectedAudit,
      'Rejected self-mutation did not produce any bogus AuditLog records',
      `Found: ${!!rejectedAudit}`
    );

  } finally {
    await dataManager.cleanup();
  }
}
