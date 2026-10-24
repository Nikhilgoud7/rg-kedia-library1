// tests/suites/migrationSimulation.test.js — Staging Dry-Run, Migration Simulation & Rollback Suite (Phase 9E)
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { validateRestoreDatabaseTarget } from '../../dist/server/lib/backup/restoreEngine.js';
import { executeStagingDryRun } from '../../dist/server/lib/migration/dryRunEngine.js';
import { executeMigrationSimulation } from '../../dist/server/lib/migration/simulationEngine.js';
import { rollbackMigrationBatch } from '../../dist/server/lib/migration/rollbackEngine.js';
import { generateSyntheticCohort } from '../../dist/server/lib/cohort/syntheticGenerator.js';

export async function runMigrationSimulationTests(baseUrl, assert) {
  const prisma = new PrismaClient();
  const testKeyHex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const createdUserIds = [];
  const createdBatchIds = [];
  const createdBackupFiles = [];

  try {
    // =========================================================================
    // 1. Target Database Safety Guard & Allowlist Verification
    // =========================================================================
    // 1.1 Unapproved / production endpoint must be rejected
    let prodTargetRejected = false;
    try {
      validateRestoreDatabaseTarget('postgres://user:pass@ep-aged-sunset-b3548him-pooler.c-4.neon.tech/neondb');
    } catch (err) {
      if (err.message.includes('RESTORE_TARGET_BLOCKED')) {
        prodTargetRejected = true;
      }
    }
    assert(prodTargetRejected, 'validateRestoreDatabaseTarget rejects known production endpoint');

    // 1.2 Approved test endpoint is accepted
    const approvedTarget = validateRestoreDatabaseTarget('postgres://user:pass@ep-autumn-sky-b3vpykh4.c-4.ap-southeast-1.aws.neon.tech/neondb');
    assert(approvedTarget.host.includes('ep-autumn-sky-b3vpykh4'), 'validateRestoreDatabaseTarget accepts approved Neon test endpoint');

    // 1.3 Missing target URL throws error
    let missingTargetCaught = false;
    try {
      validateRestoreDatabaseTarget('');
    } catch (err) {
      if (err.message.includes('NO_DATABASE_CONFIGURED')) {
        missingTargetCaught = true;
      }
    }
    assert(missingTargetCaught, 'validateRestoreDatabaseTarget rejects empty database URL');

    // 1.4 Zero credentials leaked in safety guard error messages
    let leakDetected = false;
    try {
      validateRestoreDatabaseTarget('postgres://superadmin:SecretPassword123!@unauthorized-db.host.internal:5432/proddb');
    } catch (err) {
      if (err.message.includes('SecretPassword123!') || err.message.includes('superadmin')) {
        leakDetected = true;
      }
    }
    assert(!leakDetected, 'Zero credentials leaked in target database rejection errors');

    // =========================================================================
    // 2. Pure Non-Mutating Staging Dry-Run
    // =========================================================================
    const initialDbCount = await prisma.user.count();

    // Generate clean synthetic cohort of 6 users (4 students, 2 teachers)
    const cleanCohort = [
      {
        name: 'Simulated Student Alpha',
        email: `sim.student.alpha.${Date.now()}@demo.rgkedia.local`,
        role: 'STUDENT',
        rollNumber: `RGK${Math.floor(100000 + Math.random() * 900000)}`,
        program: 'BCOM',
        branch: 'General',
        year: 1,
        semester: 1,
        secondLanguage: 'TELUGU',
        phone: '9876543210',
      },
      {
        name: 'Simulated Student Beta',
        email: `sim.student.beta.${Date.now()}@demo.rgkedia.local`,
        role: 'STUDENT',
        rollNumber: `RGK${Math.floor(100000 + Math.random() * 900000)}`,
        program: 'BBA',
        branch: 'Analytics',
        year: 2,
        semester: 3,
        secondLanguage: 'HINDI',
        phone: '9876543211',
      },
      {
        name: 'Simulated Student Gamma',
        email: `sim.student.gamma.${Date.now()}@demo.rgkedia.local`,
        role: 'STUDENT',
        rollNumber: `RGK${Math.floor(100000 + Math.random() * 900000)}`,
        program: 'BSC',
        branch: 'Computer Science',
        year: 3,
        semester: 5,
        secondLanguage: 'SANSKRIT',
        phone: '9876543212',
      },
      {
        name: 'Simulated Student Delta',
        email: `sim.student.delta.${Date.now()}@demo.rgkedia.local`,
        role: 'STUDENT',
        rollNumber: `RGK${Math.floor(100000 + Math.random() * 900000)}`,
        program: 'BCOM',
        branch: 'Computers',
        year: 1,
        semester: 2,
        secondLanguage: 'ARABIC',
        phone: '9876543213',
      },
      {
        name: 'Simulated Faculty One',
        email: `sim.faculty.one.${Date.now()}@demo.rgkedia.local`,
        role: 'TEACHER',
        phone: '9876543214',
      },
      {
        name: 'Simulated Faculty Two',
        email: `sim.faculty.two.${Date.now()}@demo.rgkedia.local`,
        role: 'TEACHER',
        phone: '9876543215',
      },
    ];

    const dryRunResult = await executeStagingDryRun({
      prisma,
      input: cleanCohort,
    });

    assert(dryRunResult.status === 'READY', 'executeStagingDryRun returns status READY for valid cohort');
    assert(dryRunResult.zeroMutationVerified === true, 'dryRunResult confirms zero database mutations');
    assert(dryRunResult.totalSourceRecords === 6, 'dryRunResult accurately records total source records (6)');
    assert(dryRunResult.validRecordsCount === 6, 'dryRunResult accurately records valid records count (6)');
    assert(dryRunResult.invalidRecordsCount === 0, 'dryRunResult reports 0 invalid records');
    assert(dryRunResult.toInsertCount === 6, 'dryRunResult reports all 6 records planned for INSERT');
    assert(dryRunResult.toSkipCount === 0, 'dryRunResult reports 0 skips on first run');
    assert(dryRunResult.conflictCount === 0, 'dryRunResult reports 0 conflicts for new cohort');

    // Demographic breakdown assertions
    assert(dryRunResult.byRole.STUDENT === 4, 'dryRun demographic analysis counts exactly 4 students');
    assert(dryRunResult.byRole.TEACHER === 2, 'dryRun demographic analysis counts exactly 2 teachers');
    assert(dryRunResult.byRole.LIBRARIAN === 0, 'dryRun demographic analysis counts 0 librarians');
    assert(dryRunResult.byProgram['BCOM'] === 2, 'dryRun program analysis counts 2 BCOM students');
    assert(dryRunResult.byProgram['BBA'] === 1, 'dryRun program analysis counts 1 BBA student');
    assert(dryRunResult.byProgram['BSC'] === 1, 'dryRun program analysis counts 1 BSC student');

    // Reconciliation projection assertions
    assert(
      dryRunResult.reconciliation.totalInDbBefore === initialDbCount,
      'dryRun reconciliation captures exact initial database count'
    );
    assert(
      dryRunResult.reconciliation.projectedTotalInDbAfter === initialDbCount + 6,
      'dryRun reconciliation projects totalInDbBefore + 6'
    );
    assert(dryRunResult.reconciliation.isReconciled === true, 'dryRun reconciliation is verified mathematically');

    // Positive non-mutation check against live database
    const postDryRunDbCount = await prisma.user.count();
    assert(
      postDryRunDbCount === initialDbCount,
      'Live database user count is strictly unmodified after staging dry-run (zero mutation guarantee)'
    );

    // =========================================================================
    // 3. Staging Dry-Run Conflict & Error Detection
    // =========================================================================
    // Setup pre-existing users in the database to test conflict and skip detection
    const conflictEmail = `conflict.anchor.${Date.now()}@demo.rgkedia.local`;
    const conflictRoll = `RGK${Math.floor(100000 + Math.random() * 900000)}`;
    const anchorUser = await prisma.user.create({
      data: {
        name: 'Conflict Anchor User',
        email: conflictEmail,
        password: await bcrypt.hash('AnchorPassword123!', 10),
        role: 'STUDENT',
        rollNumber: conflictRoll,
        program: 'BCOM',
        year: 1,
        semester: 1,
        mustChangePassword: false,
      },
    });
    createdUserIds.push(anchorUser.id);

    const skipEmail = `skip.anchor.${Date.now()}@demo.rgkedia.local`;
    const skipRoll = `RGK${Math.floor(100000 + Math.random() * 900000)}`;
    const skipUser = await prisma.user.create({
      data: {
        name: 'Skip Anchor User',
        email: skipEmail,
        password: await bcrypt.hash('SkipPassword123!', 10),
        role: 'STUDENT',
        rollNumber: skipRoll,
        program: 'BCOM',
        year: 1,
        semester: 1,
        mustChangePassword: false,
      },
    });
    createdUserIds.push(skipUser.id);

    // Cohort with 4 distinct cases (no intra-cohort duplicates):
    // (a) Identical email with DIFFERENT rollNumber -> CONFLICT
    // (b) Different email with SAME rollNumber -> CONFLICT
    // (c) Identical email and rollNumber with DB -> IDEMPOTENT SKIP
    // (d) Academic year/semester mismatch -> VALIDATION ERROR
    const conflictedCohort = [
      {
        name: 'Conflicting Email User',
        email: conflictEmail,
        role: 'STUDENT',
        rollNumber: `RGK${Math.floor(100000 + Math.random() * 900000)}`, // Different roll number!
        program: 'BCOM',
        year: 1,
        semester: 1,
      },
      {
        name: 'Conflicting Roll User',
        email: `different.email.${Date.now()}@demo.rgkedia.local`,
        role: 'STUDENT',
        rollNumber: conflictRoll, // Already assigned roll number!
        program: 'BCOM',
        year: 1,
        semester: 1,
      },
      {
        name: 'Identical User',
        email: skipEmail,
        role: 'STUDENT',
        rollNumber: skipRoll, // Identical to skipUser -> planned SKIP
        program: 'BCOM',
        year: 1,
        semester: 1,
      },
      {
        name: 'Academic Mismatch User',
        email: `invalid.academic.${Date.now()}@demo.rgkedia.local`,
        role: 'STUDENT',
        rollNumber: `RGK${Math.floor(100000 + Math.random() * 900000)}`,
        program: 'BCOM',
        year: 1,
        semester: 5, // Invalid semester 5 for year 1!
      },
    ];

    const conflictDryRunResult = await executeStagingDryRun({
      prisma,
      input: conflictedCohort,
    });

    assert(conflictDryRunResult.status === 'BLOCKED', 'Dry run status is BLOCKED when conflicts or errors exist');
    assert(conflictDryRunResult.conflictCount >= 2, 'Dry run accurately identifies at least 2 database conflicts');
    assert(
      conflictDryRunResult.conflicts.some((c) => c.conflictType === 'EMAIL_ALREADY_EXISTS_WITH_DIFFERENT_ROLL'),
      'Dry run flags EMAIL_ALREADY_EXISTS_WITH_DIFFERENT_ROLL'
    );
    assert(
      conflictDryRunResult.conflicts.some((c) => c.conflictType === 'ROLL_ALREADY_EXISTS_WITH_DIFFERENT_EMAIL'),
      'Dry run flags ROLL_ALREADY_EXISTS_WITH_DIFFERENT_EMAIL'
    );
    assert(
      conflictDryRunResult.toSkipCount === 1,
      'Dry run correctly identifies 1 idempotent SKIP for identical pre-existing user'
    );
    assert(
      conflictDryRunResult.invalidRecordsCount >= 1,
      'Dry run flags academic mismatch as invalid record'
    );

    // =========================================================================
    // 4. Pre-Migration Backup Enforcement
    // =========================================================================
    let backupEnforcementCaught = false;
    try {
      await executeMigrationSimulation(prisma, cleanCohort.slice(0, 2), {
        actorId: anchorUser.id,
        requirePreBackup: true,
        // no backupEncryptionKey provided
      });
    } catch (err) {
      if (err.message.includes('PRE_BACKUP_REQUIRED')) {
        backupEnforcementCaught = true;
      }
    }
    assert(backupEnforcementCaught, 'executeMigrationSimulation enforces pre-migration backup requirement');

    // =========================================================================
    // 5. Atomic Transactional Simulation Execution
    // =========================================================================
    const simCohort = cleanCohort.slice(0, 3); // 3 students
    const preSimCount = await prisma.user.count();
    const batchId = `TEST-SIM-${Date.now()}`;
    createdBatchIds.push(batchId);

    const simResult = await executeMigrationSimulation(prisma, simCohort, {
      batchId,
      actorId: anchorUser.id,
      requirePreBackup: true,
      backupEncryptionKey: testKeyHex,
    });

    assert(simResult.status === 'SUCCESS', 'Migration simulation status is SUCCESS');
    assert(simResult.batchId === batchId, 'Simulation result contains designated batchId');
    assert(simResult.insertedCount === 3, 'Simulation inserted exactly 3 new users');
    assert(simResult.skippedCount === 0, 'Simulation skipped 0 users on clean initial run');
    assert(simResult.conflictCount === 0, 'Simulation encountered 0 conflicts');
    assert(simResult.createdUserIds.length === 3, 'Simulation returns 3 created user IDs');
    assert(simResult.preBackupVerified === true, 'Simulation verifies pre-migration backup was created and verified');
    assert(simResult.auditLogCreated === true, 'Simulation verifies AuditLog entry was recorded');

    // Track created user IDs for safe cleanup
    simResult.createdUserIds.forEach((id) => createdUserIds.push(id));
    if (simResult.preBackupFile) {
      createdBackupFiles.push(simResult.preBackupFile);
      createdBackupFiles.push(`${simResult.preBackupFile}.sha256`);
    }

    // Mathematical reconciliation assertions
    const postSimCount = await prisma.user.count();
    assert(
      postSimCount === preSimCount + 3,
      'Post-simulation database count equals preSimCount + 3 (strict mathematical reconciliation)'
    );
    assert(simResult.reconciliation.isReconciled === true, 'Simulation reconciliation flag is true');

    // Verify properties of newly inserted simulated users
    const insertedUsers = await prisma.user.findMany({
      where: { id: { in: simResult.createdUserIds } },
    });
    assert(insertedUsers.length === 3, 'All 3 inserted users retrieved from database');

    const allMustChange = insertedUsers.every((u) => u.mustChangePassword === true);
    assert(allMustChange, 'All simulated migration users have mustChangePassword=true enforced');

    const allActive = insertedUsers.every((u) => u.active === true);
    assert(allActive, 'All simulated migration users are active=true');

    const alphaUser = insertedUsers.find((u) => u.email.includes('sim.student.alpha'));
    assert(alphaUser !== undefined, 'sim.student.alpha successfully persisted');
    assert(alphaUser?.role === 'STUDENT', 'sim.student.alpha has role STUDENT');
    assert(alphaUser?.program === 'BCOM', 'sim.student.alpha has program BCOM');
    assert(alphaUser?.semester === 1, 'sim.student.alpha has semester 1');
    assert(alphaUser?.secondLanguage === 'TELUGU', 'sim.student.alpha has secondLanguage TELUGU');

    // Verify bcrypt password hash format
    const passwordHashValid = alphaUser?.password?.startsWith('$2');
    assert(passwordHashValid, 'Simulated user password is a valid bcrypt hash');

    // Verify AuditLog entry
    const auditEntry = await prisma.auditLog.findFirst({
      where: { action: 'MIGRATION_SIMULATION_EXECUTED', targetId: batchId },
    });
    assert(auditEntry !== null, 'AuditLog entry with action MIGRATION_SIMULATION_EXECUTED exists');
    assert(auditEntry?.actorId === anchorUser.id, 'AuditLog entry records correct actorId');

    const auditDetails = JSON.parse(auditEntry?.details || '{}');
    assert(auditDetails.batchId === batchId, 'AuditLog details contain batchId');
    assert(auditDetails.insertedCount === 3, 'AuditLog details contain insertedCount');
    assert(!auditEntry?.details?.includes('password'), 'Zero passwords in audit log details');

    // =========================================================================
    // 6. Strict Idempotency & Safe Retry Verification
    // =========================================================================
    // Re-run the exact same cohort with the same batch ID or new batch ID
    const idempotentResult = await executeMigrationSimulation(prisma, simCohort, {
      actorId: anchorUser.id,
      skipPreBackup: true,
    });

    assert(idempotentResult.status === 'SUCCESS', 'Idempotent re-run completes with status SUCCESS');
    assert(idempotentResult.insertedCount === 0, 'Idempotent re-run inserts 0 new records');
    assert(idempotentResult.skippedCount === 3, 'Idempotent re-run skips all 3 existing records');
    assert(idempotentResult.createdUserIds.length === 0, 'Idempotent re-run created 0 user IDs');

    const postRetryCount = await prisma.user.count();
    assert(
      postRetryCount === postSimCount,
      'Database user count is completely unchanged after idempotent re-run (zero count drift)'
    );

    // =========================================================================
    // 7. Non-Mutating Transactional Dry-Run Option (dryRun: true)
    // =========================================================================
    const dryRunCohort = [cleanCohort[3]]; // Student Delta (not yet inserted)
    const preDryRunCount = await prisma.user.count();

    const dryRunSimResult = await executeMigrationSimulation(prisma, dryRunCohort, {
      actorId: anchorUser.id,
      dryRun: true,
      skipPreBackup: true,
    });

    assert(dryRunSimResult.status === 'ROLLED_BACK', 'Transactional dry-run returns status ROLLED_BACK');
    assert(dryRunSimResult.insertedCount === 0, 'Transactional dry-run reports 0 persistent insertions');

    const postDryRunCount = await prisma.user.count();
    assert(
      postDryRunCount === preDryRunCount,
      'Database count is strictly identical after transactional dry-run rollback'
    );

    // =========================================================================
    // 8. Safe Batch Rollback Engine (rollbackMigrationBatch)
    // =========================================================================
    const preRollbackCount = await prisma.user.count();

    const rollbackResult = await rollbackMigrationBatch(prisma, {
      batchId,
      actorId: anchorUser.id,
    });

    assert(rollbackResult.status === 'SUCCESS', 'rollbackMigrationBatch returns status SUCCESS');
    assert(rollbackResult.batchId === batchId, 'rollbackMigrationBatch confirms batchId');
    assert(rollbackResult.deletedCount === 3, 'rollbackMigrationBatch deleted exactly 3 users');
    assert(
      rollbackResult.postRollbackCount === preRollbackCount - 3,
      'Post-rollback count matches preRollbackCount - 3'
    );
    assert(rollbackResult.isReconciled === true, 'Rollback reconciliation is verified mathematically');
    assert(rollbackResult.auditLogCreated === true, 'Rollback records administrative AuditLog entry');

    // Confirm that the simulated users no longer exist
    const remainingUsers = await prisma.user.findMany({
      where: { id: { in: simResult.createdUserIds } },
    });
    assert(remainingUsers.length === 0, 'All batch users completely purged from database');

    // Confirm Rollback AuditLog
    const rollbackAudit = await prisma.auditLog.findFirst({
      where: { action: 'MIGRATION_ROLLBACK_EXECUTED', targetId: batchId },
    });
    assert(rollbackAudit !== null, 'AuditLog entry with action MIGRATION_ROLLBACK_EXECUTED exists');

    // =========================================================================
    // 9. Rollback Active Lending Dependency Guard
    // =========================================================================
    // Create a new simulated student and give them an active lending record
    const guardedStudentEmail = `guarded.student.${Date.now()}@demo.rgkedia.local`;
    const guardedBatchId = `GUARDED-BATCH-${Date.now()}`;
    createdBatchIds.push(guardedBatchId);

    const guardedSim = await executeMigrationSimulation(
      prisma,
      [
        {
          name: 'Guarded Student',
          email: guardedStudentEmail,
          role: 'STUDENT',
          rollNumber: `RGK${Math.floor(100000 + Math.random() * 900000)}`,
          program: 'BCOM',
          year: 1,
          semester: 1,
          secondLanguage: 'TELUGU',
        },
      ],
      {
        batchId: guardedBatchId,
        actorId: anchorUser.id,
        skipPreBackup: true,
      }
    );
    guardedSim.createdUserIds.forEach((id) => createdUserIds.push(id));

    // Find an available book copy to issue to this student
    const availableCopy = await prisma.bookCopy.findFirst({
      where: { status: 'AVAILABLE' },
    });

    if (availableCopy) {
      // Create an active lending record for this student
      const testLending = await prisma.lending.create({
        data: {
          userId: guardedSim.createdUserIds[0],
          bookCopyId: availableCopy.id,
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          status: 'ISSUED',
        },
      });

      let dependencyBlocked = false;
      try {
        await rollbackMigrationBatch(prisma, {
          batchId: guardedBatchId,
          actorId: anchorUser.id,
        });
      } catch (err) {
        if (err.message.includes('DEPENDENCY_CONFLICT') && err.message.includes('active book loan')) {
          dependencyBlocked = true;
        }
      }
      assert(dependencyBlocked, 'rollbackMigrationBatch is blocked when a user has active book loans');

      // Cleanup test lending safely
      await prisma.lending.delete({ where: { id: testLending.id } });

      // Now rollback succeeds after loan is resolved
      const unblockedRollback = await rollbackMigrationBatch(prisma, {
        batchId: guardedBatchId,
        actorId: anchorUser.id,
      });
      assert(unblockedRollback.status === 'SUCCESS', 'Rollback succeeds once active loan dependency is cleared');
    }

  } finally {
    // =========================================================================
    // 10. Guaranteed Synthetic Data Cleanup
    // =========================================================================
    try {
      if (createdUserIds.length > 0) {
        await prisma.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
        await prisma.bookRequest.deleteMany({ where: { userId: { in: createdUserIds } } });
        await prisma.lending.deleteMany({ where: { userId: { in: createdUserIds } } });
        await prisma.auditLog.deleteMany({ where: { actorId: { in: createdUserIds } } });
        await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      }

      if (createdBatchIds.length > 0) {
        await prisma.auditLog.deleteMany({ where: { targetId: { in: createdBatchIds } } });
      }

      // Cleanup backup test files
      for (const f of createdBackupFiles) {
        try {
          if (fs.existsSync(f)) fs.unlinkSync(f);
        } catch {}
      }
    } finally {
      await prisma.$disconnect();
    }
  }
}
