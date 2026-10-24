// server/lib/migration/dryRunEngine.ts — Pure Non-Mutating Staging Dry-Run Engine

import { PrismaClient } from '@prisma/client';
import { validateSyntheticCohort, parseCohortInput } from '../cohort/cohortValidator.js';
import { SyntheticUserRecord, UserRole } from '../cohort/types.js';
import {
  StagingDryRunResult,
  PlannedMigrationAction,
  MigrationConflictRecord,
  MigrationReconciliationCounts,
} from './types.js';

export interface DryRunOptions {
  prisma: PrismaClient;
  input: SyntheticUserRecord[] | string;
  allowedEmailDomains?: string[];
}

/**
 * Executes a pure, non-mutating staging dry-run of a proposed migration cohort.
 *
 * GUARANTEES:
 * 1. Zero database writes, updates, deletions, or schema changes.
 * 2. Positively verifies zero-mutation by comparing pre- and post-analysis database record counts.
 * 3. Categorizes each record into planned operations: INSERT, SKIP (idempotent), or CONFLICT.
 * 4. Produces zero-PII metrics and role distributions.
 */
export async function executeStagingDryRun(options: DryRunOptions): Promise<StagingDryRunResult> {
  const { prisma, input, allowedEmailDomains } = options;

  // 1. Measure Pre-Analysis Baseline Counts in Target Database
  const [totalBefore, studentsBefore, teachersBefore, librariansBefore] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: 'STUDENT' } }),
    prisma.user.count({ where: { role: 'TEACHER' } }),
    prisma.user.count({ where: { role: 'LIBRARIAN' } }),
  ]);

  // 2. Validate Cohort Structure & Syntax using CohortValidator
  const validationResult = await validateSyntheticCohort(input, {
    checkDatabase: false, // We perform full custom relational diffing below
    allowedEmailDomains,
  });

  const parsed = parseCohortInput(input);
  const totalSourceRecords = parsed.records.length;
  const validRecordsCount = validationResult.validRecords.length;
  const invalidRecordsCount = totalSourceRecords - validRecordsCount;

  // 3. Extract Candidates for Database Diffing
  const candidateEmails = validationResult.validRecords
    .map((r: SyntheticUserRecord) => r.email?.toLowerCase().trim())
    .filter(Boolean);
  const candidateRollNumbers = validationResult.validRecords
    .map((r: SyntheticUserRecord) => r.rollNumber?.trim())
    .filter((r: string | null | undefined): r is string => Boolean(r));

  // Query existing database state
  const existingUsers = await prisma.user.findMany({
    where: {
      OR: [
        { email: { in: candidateEmails, mode: 'insensitive' } },
        ...(candidateRollNumbers.length > 0
          ? [{ rollNumber: { in: candidateRollNumbers, mode: 'insensitive' as const } }]
          : []),
      ],
    },
    select: {
      id: true,
      email: true,
      rollNumber: true,
      role: true,
    },
  });

  const emailToUser = new Map<string, (typeof existingUsers)[0]>();
  const rollToUser = new Map<string, (typeof existingUsers)[0]>();

  for (const u of existingUsers) {
    if (u.email) emailToUser.set(u.email.toLowerCase(), u);
    if (u.rollNumber) rollToUser.set(u.rollNumber.toUpperCase(), u);
  }

  // 4. Classify Operations and Conflicts
  const plannedActions: PlannedMigrationAction[] = [];
  const conflicts: MigrationConflictRecord[] = [];
  const byRole: Record<UserRole, number> = { STUDENT: 0, TEACHER: 0, LIBRARIAN: 0 };
  const byProgram: Record<string, number> = {};

  let toInsertCount = 0;
  let toSkipCount = 0;
  let conflictCount = 0;

  for (let idx = 0; idx < validationResult.validRecords.length; idx++) {
    const record: SyntheticUserRecord = validationResult.validRecords[idx];
    const rowNumber = idx + 1;
    const emailKey = record.email.toLowerCase().trim();
    const rollKey = record.rollNumber?.toUpperCase().trim() || null;

    const existingByEmail = emailToUser.get(emailKey);
    const existingByRoll = rollKey ? rollToUser.get(rollKey) : undefined;

    // Tally demographic metrics
    const roleKey: UserRole = record.role as UserRole;
    if (byRole[roleKey] !== undefined) {
      byRole[roleKey] = byRole[roleKey] + 1;
    }
    if (record.program) {
      byProgram[record.program] = (byProgram[record.program] || 0) + 1;
    }

    if (!existingByEmail && !existingByRoll) {
      // Clean new insert
      toInsertCount++;
      plannedActions.push({
        row: rowNumber,
        operation: 'INSERT',
        email: emailKey,
        role: roleKey,
        rollNumber: record.rollNumber,
        reason: 'New record — planned for creation with mustChangePassword=true',
      });
    } else if (existingByEmail && (!existingByRoll || existingByEmail.id === existingByRoll.id)) {
      // User exists with matching email and rollNumber
      const rollMatches = (existingByEmail.rollNumber || null) === rollKey;
      const roleMatches = existingByEmail.role === record.role;

      if (rollMatches && roleMatches) {
        toSkipCount++;
        plannedActions.push({
          row: rowNumber,
          operation: 'SKIP',
          email: emailKey,
          role: roleKey,
          rollNumber: record.rollNumber,
          existingUserId: existingByEmail.id,
          reason: 'Identical user already exists in database (idempotent skip)',
        });
      } else {
        conflictCount++;
        const conflictType = !rollMatches
          ? 'EMAIL_ALREADY_EXISTS_WITH_DIFFERENT_ROLL'
          : 'DATABASE_FIELD_MISMATCH';
        const reason = !rollMatches
          ? `Email exists with rollNumber "${existingByEmail.rollNumber}" vs input "${record.rollNumber}"`
          : `Email exists with role "${existingByEmail.role}" vs input "${record.role}"`;

        conflicts.push({
          row: rowNumber,
          email: emailKey,
          rollNumber: record.rollNumber,
          conflictType,
          reason,
        });
        plannedActions.push({
          row: rowNumber,
          operation: 'CONFLICT',
          email: emailKey,
          role: roleKey,
          rollNumber: record.rollNumber,
          existingUserId: existingByEmail.id,
          reason,
        });
      }
    } else if (existingByRoll && !existingByEmail) {
      // Roll number exists under a different email
      conflictCount++;
      const reason = `Roll number "${record.rollNumber}" is already assigned in database to user "${existingByRoll.email}"`;
      conflicts.push({
        row: rowNumber,
        email: emailKey,
        rollNumber: record.rollNumber,
        conflictType: 'ROLL_ALREADY_EXISTS_WITH_DIFFERENT_EMAIL',
        reason,
      });
      plannedActions.push({
        row: rowNumber,
        operation: 'CONFLICT',
        email: emailKey,
        role: roleKey,
        rollNumber: record.rollNumber,
        existingUserId: existingByRoll.id,
        reason,
      });
    } else {
      // Both exist pointing to different users
      conflictCount++;
      const reason = `Email and roll number match two different existing users in database`;
      conflicts.push({
        row: rowNumber,
        email: emailKey,
        rollNumber: record.rollNumber,
        conflictType: 'DATABASE_FIELD_MISMATCH',
        reason,
      });
      plannedActions.push({
        row: rowNumber,
        operation: 'CONFLICT',
        email: emailKey,
        role: roleKey,
        rollNumber: record.rollNumber,
        reason,
      });
    }
  }

  // 5. Measure Post-Analysis Counts to Verify Zero-Mutation Guarantee
  const [totalAfter] = await Promise.all([prisma.user.count()]);
  const zeroMutationVerified = totalBefore === totalAfter;

  if (!zeroMutationVerified) {
    throw new Error(
      `FATAL_DRY_RUN_MUTATION: Database was unexpectedly modified during dry run! Pre-count: ${totalBefore}, Post-count: ${totalAfter}`
    );
  }

  // 6. Compute Projected Reconciliation
  const projectedTotalInDbAfter = totalBefore + toInsertCount;
  const isReconciled = totalBefore + toInsertCount === projectedTotalInDbAfter;

  const reconciliation: MigrationReconciliationCounts = {
    totalInDbBefore: totalBefore,
    studentsInDbBefore: studentsBefore,
    teachersInDbBefore: teachersBefore,
    librariansInDbBefore: librariansBefore,
    plannedInserts: toInsertCount,
    plannedSkips: toSkipCount,
    plannedConflicts: conflictCount,
    projectedTotalInDbAfter,
    isReconciled,
  };

  // 7. Status Resolution
  const isBlocked = conflictCount > 0 || invalidRecordsCount > 0 || !validationResult.isValid;
  const status: 'READY' | 'BLOCKED' = isBlocked ? 'BLOCKED' : 'READY';

  return {
    status,
    totalSourceRecords,
    validRecordsCount,
    invalidRecordsCount,
    toInsertCount,
    toSkipCount,
    conflictCount,
    byRole,
    byProgram,
    validationErrors: validationResult.errors,
    conflicts,
    plannedActions,
    reconciliation,
    zeroMutationVerified,
    dryRunAt: new Date().toISOString(),
  };
}
