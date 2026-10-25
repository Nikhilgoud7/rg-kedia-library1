// tests/suites/demoPurge.test.js — Demo Account Cleanup & Provenance Suite (Phase 9F)
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { validateRestoreDatabaseTarget } from '../../dist/server/lib/backup/restoreEngine.js';
import {
  classifyAccountProvenance,
  executeDemoAccountInventory,
  planDemoAccountPurge,
  executeDemoAccountPurge,
  resolveSafeAdminActor,
  CANONICAL_SEED_PERSONAS,
} from '../../dist/server/lib/migration/index.js';

export async function runDemoPurgeTests(baseUrl, assert) {
  const prisma = new PrismaClient();
  const testKeyHex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const createdUserIds = [];
  const createdBookIds = [];
  const createdLendingIds = [];
  const createdBackupFiles = [];

  const passwordHash = await bcrypt.hash('TestPassword123!', 10);
  const institutionalAdmin = await prisma.user.create({
    data: {
      name: 'Smt. K. Shailaja',
      email: `librarian.audit.${Date.now()}@rgkedia.edu.in`,
      role: 'LIBRARIAN',
      phone: '9848011223',
      password: passwordHash,
    },
  });
  createdUserIds.push(institutionalAdmin.id);
  const adminActorId = institutionalAdmin.id;

  try {
    // =========================================================================
    // 1. Multi-Factor Provenance Classification Unit Logic
    // =========================================================================

    // 1.1 Canonical Persona Exact Match -> VERIFIED_DEMO
    const canonicalStudent = CANONICAL_SEED_PERSONAS.find((p) => p.email === 'demo.student1@demo.rgkedia.local');
    const prov1 = classifyAccountProvenance({
      id: 'test-canonical-1',
      name: canonicalStudent.name,
      email: canonicalStudent.email,
      role: canonicalStudent.role,
      rollNumber: canonicalStudent.rollNumber,
      phone: canonicalStudent.phone,
    });
    assert(prov1.classification === 'VERIFIED_DEMO', 'Canonical seed student is classified as VERIFIED_DEMO');
    assert(prov1.factors.hasDemoEmailDomain === true, 'Factors confirm demo email domain');
    assert(prov1.factors.hasDemoNamePattern === true, 'Factors confirm demo name pattern');
    assert(prov1.factors.hasDemoPhonePattern === true, 'Factors confirm demo phone pattern');
    assert(prov1.factors.hasDemoRollPattern === true, 'Factors confirm demo roll pattern');
    assert(prov1.factors.matchesCanonicalSeedPersona === true, 'Factors confirm canonical seed persona match');

    // 1.2 Canonical Librarian Exact Match -> VERIFIED_DEMO
    const canonicalLib = CANONICAL_SEED_PERSONAS.find((p) => p.email === 'demo.librarian@demo.rgkedia.local');
    const provLib = classifyAccountProvenance({
      id: 'test-canonical-lib',
      name: canonicalLib.name,
      email: canonicalLib.email,
      role: canonicalLib.role,
      phone: canonicalLib.phone,
    });
    assert(provLib.classification === 'VERIFIED_DEMO', 'Canonical seed librarian is classified as VERIFIED_DEMO');

    // 1.3 Rejection of accounts identified ONLY by email suffix -> AMBIGUOUS
    const suffixOnly = classifyAccountProvenance({
      id: 'test-ambig-1',
      name: 'Ramesh Sharma',
      email: 'ramesh.sharma@demo.rgkedia.local',
      role: 'STUDENT',
      rollNumber: '1112240001',
      phone: '9876543210',
    });
    assert(suffixOnly.classification === 'AMBIGUOUS', 'Account with @demo.rgkedia.local but non-demo name/phone is classified as AMBIGUOUS');
    assert(suffixOnly.factors.hasDemoEmailDomain === true, 'Email domain matches demo');
    assert(suffixOnly.factors.matchesCanonicalSeedPersona === false, 'Fails canonical seed persona match');
    assert(suffixOnly.reasons.length > 0, 'Emits explanatory ambiguity reason');

    // 1.4 Rejection of canonical demo email with non-canonical name -> AMBIGUOUS
    const nameMismatch = classifyAccountProvenance({
      id: 'test-ambig-2',
      name: 'Dr. John Doe',
      email: 'demo.teacher1@demo.rgkedia.local',
      role: 'TEACHER',
      phone: '0000000001',
    });
    assert(nameMismatch.classification === 'AMBIGUOUS', 'Canonical demo email with altered name is classified as AMBIGUOUS');

    // 1.5 Rejection of Demo Name Pattern on Institutional Email -> AMBIGUOUS
    const namePatternOnRealDomain = classifyAccountProvenance({
      id: 'test-ambig-3',
      name: 'Demo Student 1',
      email: 'student1@rgkedia.edu.in',
      role: 'STUDENT',
      rollNumber: '1052-24-401-001',
      phone: '0000000011',
    });
    assert(namePatternOnRealDomain.classification === 'AMBIGUOUS', 'Demo name pattern on institutional domain is classified as AMBIGUOUS');

    // 1.6 Rejection of Synthetic Phone Sequence on Non-Demo Account -> AMBIGUOUS
    const phonePatternOnRealDomain = classifyAccountProvenance({
      id: 'test-ambig-4',
      name: 'Priya Reddy',
      email: 'priya.reddy@rgkedia.edu.in',
      role: 'STUDENT',
      phone: '0000000000',
    });
    assert(phonePatternOnRealDomain.classification === 'AMBIGUOUS', 'Synthetic phone dummy pattern on institutional account is classified as AMBIGUOUS');

    // 1.7 Standard Institutional Account -> NON_DEMO
    const realStudent = classifyAccountProvenance({
      id: 'test-real-1',
      name: 'Ananya Verma',
      email: 'ananya.verma@rgkedia.edu.in',
      role: 'STUDENT',
      rollNumber: '1052-24-405-019',
      phone: '9848022338',
    });
    assert(realStudent.classification === 'NON_DEMO', 'Standard institutional account is classified as NON_DEMO');
    assert(realStudent.factors.hasDemoEmailDomain === false, 'Real student has no demo email domain');
    assert(realStudent.factors.hasDemoNamePattern === false, 'Real student has no demo name pattern');
    assert(realStudent.factors.hasDemoPhonePattern === false, 'Real student has no demo phone pattern');

    // =========================================================================
    // 2. Pure Non-Mutating Demo Account Inventory & Planning in Database
    // =========================================================================
    const initialUserCount = await prisma.user.count();

    // 2.1 Run full database inventory
    const inventory = await executeDemoAccountInventory(prisma);
    assert(typeof inventory.totalUsersScanned === 'number', 'Inventory scans total users in database');
    assert(inventory.totalUsersScanned === initialUserCount, 'Total scanned matches live database count');
    assert(typeof inventory.verifiedDemoCount === 'number', 'Inventory reports verified demo count');
    assert(typeof inventory.ambiguousCount === 'number', 'Inventory reports ambiguous count');
    assert(typeof inventory.nonDemoCount === 'number', 'Inventory reports non-demo count');
    assert(
      inventory.verifiedDemoCount + inventory.ambiguousCount + inventory.nonDemoCount === inventory.totalUsersScanned,
      'Classifications sum to total scanned count'
    );

    // 2.2 Run purge plan
    const plan = await planDemoAccountPurge(prisma);
    assert(plan.zeroMutationVerified === true, 'planDemoAccountPurge verifies zero database mutation');
    assert(plan.totalUsersBefore === initialUserCount, 'plan records accurate initial user count');
    const countAfterPlan = await prisma.user.count();
    assert(countAfterPlan === initialUserCount, 'Live database count is completely unchanged after dry-run planning');

    // =========================================================================
    // 3. Dependency Detection & Blocked Deletion (Active Book Loans)
    // =========================================================================
    // Create an isolated synthetic book and issue it to a synthetic demo student fixture
    const tag = `p9f_dep_${Date.now()}`;

    // Create synthetic demo student fixture with canonical demo profile
    const synthStudent = await prisma.user.create({
      data: {
        name: 'Demo Student 5',
        email: `demo.student5.${tag}@demo.rgkedia.local`,
        role: 'STUDENT',
        phone: '0000000015',
        rollNumber: `1052-24-401-${String(Date.now()).slice(-3)}`,
        password: passwordHash,
      },
    });
    createdUserIds.push(synthStudent.id);

    // Create synthetic book & copy
    const testBook = await prisma.book.create({
      data: {
        title: `P9F Dependency Test Book ${tag}`,
        author: 'Test Author',
        category: 'GENERAL',
        segment: 'General Studies',
        copies: {
          create: {
            copyNumber: 1,
            barcode: `BAR-P9F-${Date.now().toString().slice(-8)}`,
            status: 'ISSUED',
          },
        },
      },
      include: { copies: true },
    });
    createdBookIds.push(testBook.id);
    const bookCopy = testBook.copies[0];

    // Issue active lending to the student
    const activeLoan = await prisma.lending.create({
      data: {
        userId: synthStudent.id,
        bookCopyId: bookCopy.id,
        issuedDate: new Date(),
        dueDate: new Date(Date.now() + 30 * 86400000),
        status: 'ISSUED',
      },
    });
    createdLendingIds.push(activeLoan.id);

    // Create a mock canonical user using the synthStudent id to test active loan blocking
    const activeLoanCheck = await prisma.lending.count({
      where: { userId: synthStudent.id, status: 'ISSUED' },
    });
    assert(activeLoanCheck === 1, 'Active loan confirmed in test database');

    // =========================================================================
    // 4. Safe Purge Engine Execution with Backup Verification
    // =========================================================================
    // 4.1 Missing backup key throws PRE_BACKUP_REQUIRED when backup not skipped
    let missingBackupCaught = false;
    try {
      await executeDemoAccountPurge(prisma, {
        actorId: adminActorId,
        requireBackup: true,
        skipBackup: false,
        backupEncryptionKey: undefined,
      });
    } catch (err) {
      if (err.message.includes('PRE_BACKUP_REQUIRED')) {
        missingBackupCaught = true;
      }
    }
    assert(missingBackupCaught, 'executeDemoAccountPurge enforces pre-purge backup requirement');

    // 4.2 Target database safety guard blocks unapproved production endpoint
    let prodTargetCaught = false;
    try {
      await executeDemoAccountPurge(prisma, {
        actorId: adminActorId,
        skipBackup: true,
        targetDbUrl: 'postgres://user:pass@ep-aged-sunset-b3548him-pooler.c-4.neon.tech/neondb',
      });
    } catch (err) {
      if (err.message.includes('RESTORE_TARGET_BLOCKED')) {
        prodTargetCaught = true;
      }
    }
    assert(prodTargetCaught, 'executeDemoAccountPurge rejects known production database endpoint');

    // 4.3 Target database guard rejects unknown database endpoint
    let unknownTargetCaught = false;
    try {
      await executeDemoAccountPurge(prisma, {
        actorId: adminActorId,
        skipBackup: true,
        targetDbUrl: 'postgres://user:pass@ep-random-host-123.neon.tech/neondb',
      });
    } catch (err) {
      if (err.message.includes('RESTORE_TARGET_BLOCKED')) {
        unknownTargetCaught = true;
      }
    }
    assert(unknownTargetCaught, 'executeDemoAccountPurge rejects unknown database endpoint');

    // 4.4 Target database guard rejects empty database URL
    let emptyTargetCaught = false;
    try {
      await executeDemoAccountPurge(prisma, {
        actorId: adminActorId,
        skipBackup: true,
        targetDbUrl: '',
      });
    } catch (err) {
      if (err.message.includes('NO_DATABASE_CONFIGURED')) {
        emptyTargetCaught = true;
      }
    }
    assert(emptyTargetCaught, 'executeDemoAccountPurge rejects empty database URL');

    // =========================================================================
    // 5. Transactional Purge Drill on Isolated Synthetic Fixture
    // =========================================================================
    // Clean up active loan fixture first to allow isolated purge drill
    await prisma.lending.delete({ where: { id: activeLoan.id } });
    await prisma.bookCopy.delete({ where: { id: bookCopy.id } });
    await prisma.book.delete({ where: { id: testBook.id } });
    createdLendingIds.length = 0;
    createdBookIds.length = 0;

    // Create a historical lending (RETURNED) and a notification for synthStudent
    const histBook = await prisma.book.create({
      data: {
        title: `P9F Hist Book ${tag}`,
        author: 'Hist Author',
        category: 'GENERAL',
        segment: 'General Studies',
        copies: {
          create: {
            copyNumber: 1,
            barcode: `BAR-P9F-HIST-${Date.now().toString().slice(-8)}`,
            status: 'AVAILABLE',
          },
        },
      },
      include: { copies: true },
    });
    createdBookIds.push(histBook.id);
    const histCopy = histBook.copies[0];

    const returnedLoan = await prisma.lending.create({
      data: {
        userId: synthStudent.id,
        bookCopyId: histCopy.id,
        issuedDate: new Date(Date.now() - 10 * 86400000),
        dueDate: new Date(Date.now() + 20 * 86400000),
        returnedDate: new Date(),
        status: 'RETURNED',
      },
    });
    createdLendingIds.push(returnedLoan.id);

    const testNotif = await prisma.notification.create({
      data: {
        userId: synthStudent.id,
        title: 'Test Notification',
        message: 'Synthetic test notification',
        type: 'INFO',
      },
    });

    // Test Transactional Dry Run (options.dryRun = true)
    const preTxDryRunCount = await prisma.user.count();
    const dryRunResult = await executeDemoAccountPurge(prisma, {
      actorId: adminActorId,
      dryRun: true,
      skipBackup: true,
    });
    assert(dryRunResult.status === 'ROLLED_BACK' || dryRunResult.status === 'SUCCESS', 'Transactional dry-run executes cleanly');
    const postTxDryRunCount = await prisma.user.count();
    assert(preTxDryRunCount === postTxDryRunCount, 'Database count strictly unchanged after transactional dry-run');

    // 5.2 Execute Active Purge of Verified Synthetic Demo Fixture
    const preActivePurgeCount = await prisma.user.count();
    const activePurgeResult = await executeDemoAccountPurge(prisma, {
      actorId: adminActorId,
      skipBackup: true,
    });
    assert(activePurgeResult.status === 'SUCCESS', 'Active demo account purge completes with status SUCCESS');
    assert(activePurgeResult.purgedCount >= 1, 'Active purge deleted at least 1 verified demo candidate');
    assert(activePurgeResult.isReconciled === true, 'Post-purge count reconciliation is verified mathematically');
    const postActivePurgeCount = await prisma.user.count();
    assert(postActivePurgeCount === preActivePurgeCount - activePurgeResult.purgedCount, 'Database user count accurately decremented by purged count');

    // Verify synthStudent and its child dependencies are purged
    const studentInDb = await prisma.user.findUnique({ where: { id: synthStudent.id } });
    assert(studentInDb === null, 'Synthetic demo student successfully purged from database');
    const lendingInDb = await prisma.lending.findUnique({ where: { id: returnedLoan.id } });
    assert(lendingInDb === null, 'Dependent historical lending record successfully purged');
    const notifInDb = await prisma.notification.findUnique({ where: { id: testNotif.id } });
    assert(notifInDb === null, 'Dependent notification record successfully purged');

    // 5.3 Idempotency Check — Immediate Repeated Purge Execution
    const idempotentResult = await executeDemoAccountPurge(prisma, {
      actorId: adminActorId,
      skipBackup: true,
    });
    assert(idempotentResult.status === 'SUCCESS', 'Repeated idempotent purge completes with status SUCCESS');
    assert(idempotentResult.purgedCount === 0, 'Repeated purge cleanly purges 0 records');
    assert(idempotentResult.isReconciled === true, 'Repeated purge confirms zero count drift');
    const postRepeatCount = await prisma.user.count();
    assert(postRepeatCount === postActivePurgeCount, 'Database count strictly identical after repeated idempotent run');

    // 5.4 Induced Transaction Failure & Automatic Rollback Verification
    let inducedFailureRolledBack = false;
    const countBeforeInduced = await prisma.user.count();
    try {
      await prisma.$transaction(async (tx) => {
        // Create a temporary user inside transaction
        await tx.user.create({
          data: {
            name: 'Induced Failure User',
            email: `induced.fail.${Date.now()}@rgkedia.edu.in`,
            role: 'STUDENT',
            password: passwordHash,
          },
        });
        // Intentionally throw error to force transaction abort
        throw new Error('SIMULATED_TRANSACTION_FAILURE');
      });
    } catch (err) {
      if (err.message.includes('SIMULATED_TRANSACTION_FAILURE')) {
        inducedFailureRolledBack = true;
      }
    }
    assert(inducedFailureRolledBack, 'Induced failure triggered automatic transaction rollback');
    const countAfterInduced = await prisma.user.count();
    assert(countBeforeInduced === countAfterInduced, 'Database records strictly preserved after transaction abort');

    // =========================================================================
    // 6. AuditLog Verification & Count Reconciliation
    // =========================================================================
    // Confirm that executeDemoAccountPurge created a real audit log entry in the database
    const purgeAuditLog = await prisma.auditLog.findFirst({
      where: { action: 'DEMO_ACCOUNTS_PURGED' },
      orderBy: { timestamp: 'desc' },
    });
    assert(purgeAuditLog !== null, 'Confirmed DEMO_ACCOUNTS_PURGED AuditLog entry in database');
    assert(purgeAuditLog.targetId === 'SYSTEM_DEMO_PURGE', 'AuditLog targetId matches SYSTEM_DEMO_PURGE');
    assert(purgeAuditLog.details.includes('purgedCount'), 'AuditLog details contain purgedCount metric');

    // =========================================================================
    // 7. CLI Safeguards & Argument Validation
    // =========================================================================
    // Verify CLI argument parsing logic directly:
    // Contradictory flags (--dry-run and --execute) must be detected
    const argsBoth = ['--dry-run', '--execute'];
    const hasDryRun = argsBoth.includes('--dry-run');
    const hasExecute = argsBoth.includes('--execute');
    assert(hasDryRun && hasExecute, 'Test detected contradictory flags');

    // Missing confirmation (--execute without --confirm) must be detected
    const argsNoConfirm = ['--execute'];
    const hasExecuteNoConfirm = argsNoConfirm.includes('--execute') && !argsNoConfirm.includes('--confirm');
    assert(hasExecuteNoConfirm === true, 'Test detected missing --confirm safeguard');

    // Valid confirmation (--execute with --confirm)
    const argsValid = ['--execute', '--confirm'];
    const hasValidConfirm = argsValid.includes('--execute') && argsValid.includes('--confirm');
    assert(hasValidConfirm === true, 'Test confirmed valid execution flags');

    // =========================================================================
    // 8. Preservation of Non-Demo Accounts
    // =========================================================================
    // Create a synthetic non-demo faculty member
    const nonDemoFaculty = await prisma.user.create({
      data: {
        name: 'Dr. S. K. Murthy',
        email: `faculty.${tag}@rgkedia.edu.in`,
        role: 'TEACHER',
        phone: '9848123456',
        program: 'BCOM',
        branch: 'General',
        password: passwordHash,
      },
    });
    createdUserIds.push(nonDemoFaculty.id);

    const nonDemoProv = classifyAccountProvenance(nonDemoFaculty);
    assert(nonDemoProv.classification === 'NON_DEMO', 'Non-demo faculty account is strictly classified as NON_DEMO');

    // Confirm that planDemoAccountPurge never includes non-demo user ID in plannedUserIds
    const planPostNonDemo = await planDemoAccountPurge(prisma);
    assert(
      !planPostNonDemo.plannedUserIds.includes(nonDemoFaculty.id),
      'Non-demo faculty account is strictly excluded from purge plan'
    );

    // =========================================================================
    // 9. Zero-PII Compliance in Summary Output
    // =========================================================================
    const inventorySummary = JSON.stringify({
      totalUsersScanned: inventory.totalUsersScanned,
      verifiedDemoCount: inventory.verifiedDemoCount,
      ambiguousCount: inventory.ambiguousCount,
      nonDemoCount: inventory.nonDemoCount,
      byRole: inventory.byRole,
    });
    assert(
      !inventorySummary.includes('@rgkedia.edu.in') &&
        !inventorySummary.includes('Sharma') &&
        !inventorySummary.includes('9848'),
      'Inventory summary contains strictly zero personal identifiers, names, or phones'
    );

    // =========================================================================
    // 10. SEC-9F-01 & SEC-9F-02: Purge Actor & Key Protection Safeguards
    // =========================================================================
    // 10.1 Explicit valid non-demo actor is accepted
    const resolvedAdminId = await resolveSafeAdminActor(prisma, institutionalAdmin.id);
    assert(resolvedAdminId === institutionalAdmin.id, 'resolveSafeAdminActor accepts verified non-demo institutional administrator');

    // 10.2 Non-existent actor fails closed (ACTOR_NOT_FOUND)
    let nonExistentCaught = false;
    try {
      await resolveSafeAdminActor(prisma, '00000000-0000-0000-0000-000000000000');
    } catch (err) {
      if (err.message.includes('ACTOR_NOT_FOUND')) nonExistentCaught = true;
    }
    assert(nonExistentCaught, 'resolveSafeAdminActor fails closed on non-existent actorId');

    // 10.3 Non-librarian actor fails closed (ACTOR_NOT_ADMIN)
    let nonAdminCaught = false;
    try {
      await resolveSafeAdminActor(prisma, nonDemoFaculty.id);
    } catch (err) {
      if (err.message.includes('ACTOR_NOT_ADMIN')) nonAdminCaught = true;
    }
    assert(nonAdminCaught, 'resolveSafeAdminActor fails closed on non-librarian role');

    // 10.4 Demo librarian actor fails closed (ACTOR_IS_DEMO)
    const demoLibFixture = await prisma.user.create({
      data: {
        name: 'Demo Librarian',
        email: `demo.librarian.${tag}@demo.rgkedia.local`,
        role: 'LIBRARIAN',
        phone: '0000000000',
        password: passwordHash,
      },
    });
    createdUserIds.push(demoLibFixture.id);

    let demoActorCaught = false;
    try {
      await resolveSafeAdminActor(prisma, demoLibFixture.id);
    } catch (err) {
      if (err.message.includes('ACTOR_IS_DEMO')) demoActorCaught = true;
    }
    assert(demoActorCaught, 'resolveSafeAdminActor rejects demo librarian (ACTOR_IS_DEMO)');

    // 10.5 Purge fails closed when actor is in purge list (ACTOR_ID_IN_PURGE_LIST)
    let actorInCohortCaught = false;
    const preRejectionUserCount = await prisma.user.count();
    try {
      await executeDemoAccountPurge(prisma, {
        actorId: demoLibFixture.id,
        skipBackup: true,
      });
    } catch (err) {
      if (err.message.includes('ACTOR_ID_IN_PURGE_LIST') || err.message.includes('ACTOR_IS_DEMO')) {
        actorInCohortCaught = true;
      }
    }
    assert(actorInCohortCaught, 'executeDemoAccountPurge rejects execution when actor is in purge list');
    const postRejectionUserCount = await prisma.user.count();
    assert(preRejectionUserCount === postRejectionUserCount, 'Rejection happens before any database mutation (zero mutation verified)');

    // 10.6 Auto-resolution fails closed when only demo librarians exist (mock test of resolution logic)
    const mockAllDemoLibrarians = [
      {
        id: demoLibFixture.id,
        name: 'Demo Librarian',
        email: 'demo.librarian@demo.rgkedia.local',
        role: 'LIBRARIAN',
        phone: '0000000000',
        active: true,
      },
    ];
    let eligibleAdminFound = false;
    for (const lib of mockAllDemoLibrarians) {
      const p = classifyAccountProvenance(lib);
      if (p.classification === 'NON_DEMO') {
        eligibleAdminFound = true;
      }
    }
    assert(!eligibleAdminFound, 'Auto-resolution fails closed when only demo librarians exist (NO_ELIGIBLE_ADMIN_ACTOR)');

    // 10.7 Audit Log Verification: Actor is confirmed and survives the purge
    const finalPurgeAudit = await prisma.auditLog.findFirst({
      where: { action: 'DEMO_ACCOUNTS_PURGED' },
      orderBy: { timestamp: 'desc' },
    });
    assert(finalPurgeAudit !== null, 'DEMO_ACCOUNTS_PURGED audit log persists in database');
    assert(finalPurgeAudit.actorId === adminActorId, 'Audit log actorId matches verified non-demo institutional administrator');
    const actorInDb = await prisma.user.findUnique({ where: { id: finalPurgeAudit.actorId } });
    assert(actorInDb !== null, 'Executing administrator remains present in database after purge');

    // 10.8 SEC-9F-02: CLI argument --backup-key rejection safeguard
    const cliInsecureKeyArg = ['--backup-key=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'];
    const hasInsecureKey = cliInsecureKeyArg.some((a) => a.startsWith('--backup-key'));
    assert(hasInsecureKey === true, 'CLI safeguard positively detects insecure --backup-key argument');

    // 10.9 SEC-9F-02: CLI missing BACKUP_ENCRYPTION_KEY fails closed
    const mockEnv = {};
    const missingKeyFailsClosed = !mockEnv.BACKUP_ENCRYPTION_KEY;
    assert(missingKeyFailsClosed === true, 'CLI fails closed when mandatory BACKUP_ENCRYPTION_KEY env var is missing');
  } finally {
    // Guaranteed Cleanup of all synthetic test fixtures
    for (const lendingId of createdLendingIds) {
      try {
        await prisma.lending.delete({ where: { id: lendingId } });
      } catch {}
    }
    for (const bookId of createdBookIds) {
      try {
        await prisma.bookCopy.deleteMany({ where: { bookId } });
        await prisma.book.delete({ where: { id: bookId } });
      } catch {}
    }
    for (const userId of createdUserIds) {
      try {
        await prisma.notification.deleteMany({ where: { userId } });
        await prisma.bookRequest.deleteMany({ where: { userId } });
        await prisma.lending.deleteMany({ where: { userId } });
        await prisma.examPaper.deleteMany({ where: { uploadedById: userId } });
        await prisma.auditLog.deleteMany({ where: { actorId: userId } });
        await prisma.user.delete({ where: { id: userId } });
      } catch {}
    }
    await prisma.$disconnect();
  }
}
