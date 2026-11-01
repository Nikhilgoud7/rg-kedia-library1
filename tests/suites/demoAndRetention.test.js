// tests/suites/demoAndRetention.test.js — Phase 3G-4C Demo Safeguards, Polling Optimization & Retention Tests
import { execSync, spawnSync } from 'child_process';
import { createApiClient } from '../helpers/apiClient.js';
import { TestDataManager } from '../helpers/testData.js';

export async function runDemoAndRetentionTests(baseUrl, assert) {
  const dataManager = new TestDataManager();

  try {
    // ---------------------------------------------------------
    // 1. GET /api/config Endpoint
    // ---------------------------------------------------------
    const anonClient = createApiClient(baseUrl);
    const configRes = await anonClient.request('GET', '/api/config');
    assert(
      configRes.status === 200,
      'GET /api/config returns HTTP 200',
      `Got status ${configRes.status}`
    );
    assert(
      typeof configRes.body?.demoMode === 'boolean',
      'GET /api/config returns boolean demoMode',
      `demoMode is ${typeof configRes.body?.demoMode} (${configRes.body?.demoMode})`
    );
    assert(
      typeof configRes.body?.name === 'string',
      'GET /api/config returns application name string',
      `name is ${configRes.body?.name}`
    );

    const isDemoModeActive = configRes.body?.demoMode === true;

    // ---------------------------------------------------------
    // 2. Persona Setup & Minimum Password Length Validation
    // ---------------------------------------------------------
    const librarian = await dataManager.createLibrarian({ tag: 'demo_lib' });
    const librarianClient = createApiClient(baseUrl);
    librarianClient.loginAs(librarian);

    const normalStudent = await dataManager.createStudent({ tag: 'norm_stu' });
    const normalStudentClient = createApiClient(baseUrl);
    normalStudentClient.loginAs(normalStudent);

    // Test 8-char validation on change-password
    const shortPwdRes = await normalStudentClient.request('PUT', '/api/auth/change-password', {
      body: {
        currentPassword: normalStudent.plainPassword,
        newPassword: 'short',
      },
    });
    assert(
      shortPwdRes.status === 400,
      'PUT /api/auth/change-password rejects passwords shorter than 8 characters with HTTP 400',
      `Got status ${shortPwdRes.status}: ${JSON.stringify(shortPwdRes.body)}`
    );
    assert(
      shortPwdRes.body?.error?.includes('8 characters'),
      'PUT /api/auth/change-password error message specifies at least 8 characters requirement',
      `Message: ${shortPwdRes.body?.error}`
    );

    // Test 8-char validation on admin user creation
    const shortAdminCreateRes = await librarianClient.request('POST', '/api/admin/users', {
      body: {
        name: 'Short Password Test',
        email: dataManager.generateEmail('STUDENT', 'short'),
        password: '123',
        role: 'STUDENT',
        rollNumber: dataManager.generateRollNumber('short'),
        program: 'BCOM',
        branch: 'General',
        semester: 1,
      },
    });
    assert(
      shortAdminCreateRes.status === 400,
      'POST /api/admin/users rejects passwords shorter than 8 characters with HTTP 400',
      `Got status ${shortAdminCreateRes.status}: ${JSON.stringify(shortAdminCreateRes.body)}`
    );

    // Test 8-char validation on admin password reset
    const shortAdminResetRes = await librarianClient.request('PUT', `/api/admin/users/${normalStudent.id}/reset-password`, {
      body: {
        newPassword: 'tiny',
      },
    });
    assert(
      shortAdminResetRes.status === 400,
      'PUT /api/admin/users/:id/reset-password rejects passwords shorter than 8 characters with HTTP 400',
      `Got status ${shortAdminResetRes.status}: ${JSON.stringify(shortAdminResetRes.body)}`
    );

    // ---------------------------------------------------------
    // 3. Demo Persona Safeguards (@demo.rgkedia.local)
    // ---------------------------------------------------------
    // Create a synthetic demo student with @demo.rgkedia.local email
    const demoEmail = `demo.synthetic.${Date.now()}@demo.rgkedia.local`;
    const hash = await dataManager.getPasswordHash();
    const demoUser = await dataManager.prisma.user.create({
      data: {
        name: 'Synthetic Demo Account',
        email: demoEmail,
        password: hash,
        role: 'STUDENT',
        rollNumber: `DEMO-${Date.now()}`,
        program: 'BCOM',
        branch: 'General',
        semester: 1,
        active: true,
      },
    });
    dataManager.createdUserIds.add(demoUser.id);

    const demoClient = createApiClient(baseUrl);
    demoClient.loginAs({ ...demoUser, plainPassword: dataManager.defaultPassword });

    if (isDemoModeActive) {
      // 3A. Demo account password change must be blocked with HTTP 403
      const demoChangeRes = await demoClient.request('PUT', '/api/auth/change-password', {
        body: {
          currentPassword: dataManager.defaultPassword,
          newPassword: 'NewValidPassword123!',
        },
      });
      assert(
        demoChangeRes.status === 403,
        'DEMO_MODE=true: PUT /api/auth/change-password for demo account is blocked with HTTP 403 Forbidden',
        `Got status ${demoChangeRes.status}: ${JSON.stringify(demoChangeRes.body)}`
      );

      // 3B. Admin password reset on demo account must be blocked with HTTP 403
      const adminDemoResetRes = await librarianClient.request('PUT', `/api/admin/users/${demoUser.id}/reset-password`, {
        body: {
          newPassword: 'AdminOverride123!',
        },
      });
      assert(
        adminDemoResetRes.status === 403,
        'DEMO_MODE=true: PUT /api/admin/users/:id/reset-password for demo account is blocked with HTTP 403 Forbidden',
        `Got status ${adminDemoResetRes.status}: ${JSON.stringify(adminDemoResetRes.body)}`
      );

      // 3C. Admin update on demo account must be blocked with HTTP 403
      const adminDemoUpdateRes = await librarianClient.request('PUT', `/api/admin/users/${demoUser.id}`, {
        body: {
          active: false,
        },
      });
      assert(
        adminDemoUpdateRes.status === 403,
        'DEMO_MODE=true: PUT /api/admin/users/:id for demo account is blocked with HTTP 403 Forbidden',
        `Got status ${adminDemoUpdateRes.status}: ${JSON.stringify(adminDemoUpdateRes.body)}`
      );

      // 3D. Admin deletion on demo account must be blocked with HTTP 403
      const adminDemoDeleteRes = await librarianClient.request('DELETE', `/api/admin/users/${demoUser.id}`);
      assert(
        adminDemoDeleteRes.status === 403,
        'DEMO_MODE=true: DELETE /api/admin/users/:id for demo account is blocked with HTTP 403 Forbidden',
        `Got status ${adminDemoDeleteRes.status}: ${JSON.stringify(adminDemoDeleteRes.body)}`
      );
    } else {
      // In non-demo mode, verify change password succeeds with >=8 chars
      const normalChangeRes = await normalStudentClient.request('PUT', '/api/auth/change-password', {
        body: {
          currentPassword: normalStudent.plainPassword,
          newPassword: 'ValidNewPassword123!',
        },
      });
      assert(
        normalChangeRes.status === 200,
        'PUT /api/auth/change-password succeeds with >=8 character password',
        `Got status ${normalChangeRes.status}`
      );
    }

    // Verify non-demo user admin update succeeds
    const adminNormalUpdateRes = await librarianClient.request('PUT', `/api/admin/users/${normalStudent.id}`, {
      body: {
        semester: 2,
      },
    });
    assert(
      adminNormalUpdateRes.status === 200,
      'PUT /api/admin/users/:id for non-demo account succeeds with HTTP 200',
      `Got status ${adminNormalUpdateRes.status}`
    );

    // ---------------------------------------------------------
    // 4. Notification Unread Count Optimization
    // ---------------------------------------------------------
    const notifStudent = await dataManager.createStudent({ tag: 'notif_cnt_stu' });
    const notifStudentClient = createApiClient(baseUrl);
    notifStudentClient.loginAs(notifStudent);

    const countRes1 = await notifStudentClient.request('GET', '/api/lending/notifications/unread-count');
    assert(
      countRes1.status === 200,
      'GET /api/lending/notifications/unread-count returns HTTP 200',
      `Got status ${countRes1.status}`
    );
    assert(
      typeof countRes1.body?.unreadCount === 'number',
      'GET /api/lending/notifications/unread-count returns numeric unreadCount',
      `unreadCount is ${countRes1.body?.unreadCount}`
    );

    const initialUnread = countRes1.body.unreadCount;

    // Create an unread notification
    const testNotif = await dataManager.createNotification({
      userId: notifStudent.id,
      title: 'Count Test Notification',
      message: 'Testing unread-count polling',
      type: 'INFO',
      read: false,
    });

    const countRes2 = await notifStudentClient.request('GET', '/api/lending/notifications/unread-count');
    assert(
      countRes2.body?.unreadCount === initialUnread + 1,
      'Unread count increments by 1 when a new unread notification exists',
      `Expected ${initialUnread + 1}, got ${countRes2.body?.unreadCount}`
    );

    // Mark as read
    await notifStudentClient.request('PUT', `/api/lending/notifications/${testNotif.id}/read`);

    const countRes3 = await notifStudentClient.request('GET', '/api/lending/notifications/unread-count');
    assert(
      countRes3.body?.unreadCount === initialUnread,
      'Unread count decrements back when notification is marked as read',
      `Expected ${initialUnread}, got ${countRes3.body?.unreadCount}`
    );

    // ---------------------------------------------------------
    // 5. Notification 90-Day Retention Engine
    // ---------------------------------------------------------
    const nowMs = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const oldDate = new Date(nowMs - 100 * dayMs); // 100 days ago (> 90 days)
    const recentDate = new Date(nowMs - 10 * dayMs); // 10 days ago (< 90 days)

    // Notification A: READ and OLD (must be deleted)
    const notifOldRead = await dataManager.prisma.notification.create({
      data: {
        userId: notifStudent.id,
        title: 'Old Read Notif',
        message: 'Must be deleted by retention',
        type: 'INFO',
        read: true,
        createdAt: oldDate,
      },
    });
    dataManager.createdNotificationIds.add(notifOldRead.id);

    // Notification B: UNREAD and OLD (must be preserved)
    const notifOldUnread = await dataManager.prisma.notification.create({
      data: {
        userId: notifStudent.id,
        title: 'Old Unread Notif',
        message: 'Must NOT be deleted by retention (unread)',
        type: 'WARNING',
        read: false,
        createdAt: oldDate,
      },
    });
    dataManager.createdNotificationIds.add(notifOldUnread.id);

    // Notification C: READ and RECENT (must be preserved)
    const notifRecentRead = await dataManager.prisma.notification.create({
      data: {
        userId: notifStudent.id,
        title: 'Recent Read Notif',
        message: 'Must NOT be deleted by retention (recent)',
        type: 'INFO',
        read: true,
        createdAt: recentDate,
      },
    });
    dataManager.createdNotificationIds.add(notifRecentRead.id);

    // Execute retention purge via CLI command
    const retentionOutput = execSync('npx tsx server/jobs/retention.ts', { encoding: 'utf-8' });
    assert(
      retentionOutput.includes('Retention job completed'),
      'server/jobs/retention.ts CLI completes successfully',
      `Output: ${retentionOutput}`
    );

    // Check database state
    const checkOldRead = await dataManager.prisma.notification.findUnique({
      where: { id: notifOldRead.id },
    });
    assert(
      checkOldRead === null,
      'Old read notification (>90 days) was purged from the database',
      `Found: ${Boolean(checkOldRead)}`
    );

    const checkOldUnread = await dataManager.prisma.notification.findUnique({
      where: { id: notifOldUnread.id },
    });
    assert(
      checkOldUnread !== null,
      'Old unread notification (>90 days) was preserved in the database',
      `Found: ${Boolean(checkOldUnread)}`
    );

    const checkRecentRead = await dataManager.prisma.notification.findUnique({
      where: { id: notifRecentRead.id },
    });
    assert(
      checkRecentRead !== null,
      'Recent read notification (<90 days) was preserved in the database',
      `Found: ${Boolean(checkRecentRead)}`
    );

    // ---------------------------------------------------------
    // 6. Production Seed Safety Guard (Phase 12D-2)
    // ---------------------------------------------------------
    // The seed script (prisma/seed.ts) contains a top-of-main fail-fast guard
    // that terminates execution with exit code 1 before any PrismaClient instantiation
    // or database queries (deleteMany) can run in production unless FORCE_SEED=true.

    const invalidDbUrl = 'postgresql://invalid:invalid@127.0.0.1:1/none';

    // Test 6A: In production without FORCE_SEED, seed script MUST exit code 1 with FATAL message
    // and attempt ZERO database connections or deletions.
    const unforcedSeedResult = spawnSync('npx', ['tsx', 'prisma/seed.ts'], {
      env: {
        ...process.env,
        NODE_ENV: 'production',
        FORCE_SEED: '',
        DATABASE_URL: invalidDbUrl,
        DATABASE_URL_UNPOOLED: invalidDbUrl,
      },
      encoding: 'utf-8',
      shell: true,
    });

    const unforcedStderr = unforcedSeedResult.stderr || '';
    const unforcedStdout = unforcedSeedResult.stdout || '';
    const unforcedOutput = `${unforcedStdout}\n${unforcedStderr}`;

    assert(
      unforcedSeedResult.status === 1,
      'Production seed without FORCE_SEED=true exits immediately with code 1',
      `Got exit code ${unforcedSeedResult.status}`
    );

    assert(
      unforcedOutput.includes('FATAL: Database seeding is blocked in production unless FORCE_SEED=true is explicitly set.'),
      'Production seed outputs FATAL guard error message when FORCE_SEED is unset',
      `Output: ${unforcedOutput}`
    );

    // Negative control verification:
    // If the guard were positioned below deleteMany() (the pre-12D-2 regression bug),
    // Prisma would have attempted a network connection to invalidDbUrl, producing Prisma
    // P1001 database connection error output ("Can't reach database server").
    // Because the guard is at the top of main() before new PrismaClient(), zero DB connection
    // is attempted.
    assert(
      !unforcedOutput.includes('P1001') && !unforcedOutput.includes('Can\'t reach database server'),
      'Production seed guard terminates before attempting database connection (zero DB queries/deletions)',
      `Output contained DB connection error: ${unforcedOutput}`
    );

    // Test 6B: In production with FORCE_SEED=true, SEED_PASSWORD must be at least 12 characters
    const shortPwdSeedResult = spawnSync('npx', ['tsx', 'prisma/seed.ts'], {
      env: {
        ...process.env,
        NODE_ENV: 'production',
        FORCE_SEED: 'true',
        SEED_PASSWORD: 'short',
        DATABASE_URL: invalidDbUrl,
        DATABASE_URL_UNPOOLED: invalidDbUrl,
      },
      encoding: 'utf-8',
      shell: true,
    });

    const shortPwdStderr = shortPwdSeedResult.stderr || '';
    const shortPwdStdout = shortPwdSeedResult.stdout || '';
    const shortPwdOutput = `${shortPwdStdout}\n${shortPwdStderr}`;

    assert(
      shortPwdSeedResult.status === 1,
      'Production seed with short SEED_PASSWORD (<12 chars) exits with code 1 even if FORCE_SEED=true',
      `Got exit code ${shortPwdSeedResult.status}`
    );

    assert(
      shortPwdOutput.includes('FATAL: SEED_PASSWORD environment variable must be at least 12 characters in production.'),
      'Production seed with short SEED_PASSWORD outputs FATAL password length error message',
      `Output: ${shortPwdOutput}`
    );

    // Test 6C: Positive control — NODE_ENV=development is NOT blocked by production seed guard
    const devSeedResult = spawnSync('npx', ['tsx', 'prisma/seed.ts'], {
      env: {
        ...process.env,
        NODE_ENV: 'development',
        FORCE_SEED: '',
        DATABASE_URL: invalidDbUrl,
        DATABASE_URL_UNPOOLED: invalidDbUrl,
      },
      encoding: 'utf-8',
      shell: true,
    });

    const devStderr = devSeedResult.stderr || '';
    const devStdout = devSeedResult.stdout || '';
    const devOutput = `${devStdout}\n${devStderr}`;

    assert(
      !devOutput.includes('FATAL: Database seeding is blocked in production'),
      'Positive control: Development environment (NODE_ENV=development) is not blocked by production seed guard',
      `Development seed was blocked: ${devOutput}`
    );

  } finally {
    await dataManager.cleanup();
    await dataManager.prisma.$disconnect();
  }
}
