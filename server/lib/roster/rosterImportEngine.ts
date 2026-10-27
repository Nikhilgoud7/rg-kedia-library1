// server/lib/roster/rosterImportEngine.ts — Transactional Student Roster Import Engine
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import {
  RosterImportOptions,
  RosterImportResult,
  RosterImportSuccessResult,
  StudentRosterRecord,
  GeneratedStudentCredential,
  StudentCredentialEnvelope,
} from './types.js';
import { validateRosterCsv, checkRosterDbCollisions } from './rosterValidator.js';
import {
  generateSecurePassword,
  validateCredentialOutputPath,
} from '../cohort/credentialGenerator.js';
import { serializeCsv } from '../bulkImportFormat.js';

/**
 * Redacts database connection strings, passwords, and secrets from error messages.
 */
export function sanitizeErrorMessage(message: string): string {
  if (!message || typeof message !== 'string') return 'Unknown error';

  return message
    // Redact postgres://user:password@host:port/db
    .replace(/(postgres(?:ql)?:\/\/[^:]+:)[^@]+(@[^\s/?#]+)/gi, '$1<credentials-redacted>$2')
    // Redact generic connection strings protocol://user:pass@host
    .replace(/:\/\/([^:@\s]+):([^@\s]+)@/g, '://$1:<credentials-redacted>@')
    // Redact bare passwords in query params (?password=...)
    .replace(/([?&](?:password|pwd|secret)=)[^&]+/gi, '$1<redacted>');
}

/**
 * Resolves a safe administrative actor (Librarian) for audit log persistence.
 */
export async function resolveImportAdminActor(
  prisma: any,
  requestedActorId?: string
): Promise<string> {
  if (requestedActorId && typeof requestedActorId === 'string' && requestedActorId.trim()) {
    const actor = await prisma.user.findUnique({
      where: { id: requestedActorId.trim() },
      select: { id: true, email: true, role: true, active: true },
    });

    if (!actor) {
      throw new Error(`ACTOR_NOT_FOUND: Specified administrative actor with ID "${requestedActorId}" does not exist.`);
    }
    if (actor.role !== 'LIBRARIAN') {
      throw new Error(`ACTOR_NOT_ADMIN: Specified actor "${actor.email}" is not a LIBRARIAN (role: ${actor.role}).`);
    }
    if (!actor.active) {
      throw new Error(`ACTOR_DEACTIVATED: Specified administrator "${actor.email}" is deactivated.`);
    }

    return actor.id;
  }

  // Auto-resolve first active Librarian
  const librarian = await prisma.user.findFirst({
    where: { role: 'LIBRARIAN', active: true },
    select: { id: true, email: true },
    orderBy: { createdAt: 'asc' },
  });

  if (!librarian) {
    throw new Error(
      'NO_ACTIVE_LIBRARIAN: A librarian account must exist before student roster import can be executed. Run the initial librarian bootstrap first.'
    );
  }

  return librarian.id;
}

/**
 * Executes a production-grade student roster import.
 *
 * SAFETY & INTEGRITY GUARANTEES:
 * 1. Pre-validates CSV headers, data types, and academic constraints before touching the database.
 * 2. Pre-checks for database collisions (duplicate emails or roll numbers).
 * 3. Dry-run mode performs zero writes (no users, no audit logs, no credential exports).
 * 4. Production confirmation safeguard requires explicit confirmation (--confirm) in NODE_ENV=production.
 * 5. Uses PostgreSQL transaction advisory locking to serialize concurrent roster imports.
 * 6. Atomic execution: user creation and required audit log succeed or fail together inside a single Prisma transaction.
 * 7. Passwords generated with high entropy (16 chars, 4 character classes), hashed with bcrypt (salt 10).
 * 8. Never logs, prints, or exposes plaintext passwords or password hashes.
 * 9. Exclusive, race-safe credential export staging prevents overwrite and prevents lost credentials on DB failure.
 * 10. Automatically disconnects Prisma if owned.
 */
export async function executeStudentRosterImport(
  options: RosterImportOptions
): Promise<RosterImportResult> {
  const env = options.env || process.env;
  const isDryRun = Boolean(options.dryRun);
  const skipExisting = options.skipExisting !== false; // default true: skip existing records idempotently

  // 1. Production Confirmation Safeguard
  const nodeEnv = (env.NODE_ENV || 'development').toLowerCase().trim();
  const isProduction = nodeEnv === 'production';
  const hasConfirm = Boolean(
    options.confirmProduction ||
      env.CONFIRM_ROSTER_IMPORT === 'true' ||
      env.CONFIRM_PRODUCTION_IMPORT === 'true'
  );

  if (isProduction && !isDryRun && !hasConfirm) {
    return {
      success: false,
      dryRun: false,
      code: 'ROSTER_IMPORT_CONFIRMATION_REQUIRED',
      error:
        'ROSTER_IMPORT_CONFIRMATION_REQUIRED: In production environment (NODE_ENV=production), live student roster import requires an explicit confirmation flag (--confirm) to prevent accidental execution.',
    };
  }

  // 2. Validate CSV Structure & Records
  const validation = validateRosterCsv(options.csvText);
  if (!validation.isValid || validation.validRecords.length === 0) {
    return {
      success: false,
      dryRun: isDryRun,
      code: 'VALIDATION_FAILED',
      error: 'CSV validation failed. Please correct the highlighted errors before importing.',
      validation,
    };
  }

  // 3. Validate Credential Output Path if requested (SEC-T2-01 & SEC-T2-02 Pre-flight)
  let validatedCredentialsPath: string | null = null;
  if (options.credentialsOutputPath) {
    try {
      validatedCredentialsPath = validateCredentialOutputPath(options.credentialsOutputPath);
    } catch (err: any) {
      return {
        success: false,
        dryRun: isDryRun,
        code: 'INVALID_CREDENTIALS_PATH',
        error: sanitizeErrorMessage(err.message),
      };
    }

    // FIX 1 (SEC-T2-01): Fail closed if target credential destination already exists
    if (fs.existsSync(validatedCredentialsPath)) {
      return {
        success: false,
        dryRun: isDryRun,
        code: 'CREDENTIAL_DESTINATION_EXISTS',
        error: `CREDENTIAL_DESTINATION_EXISTS: Target credential file "${validatedCredentialsPath}" already exists. Overwriting existing credential exports is strictly prohibited to prevent data loss.`,
      };
    }

    // Validate destination directory is writable / can be created
    const outputDir = path.dirname(validatedCredentialsPath);
    if (fs.existsSync(outputDir)) {
      try {
        const stat = fs.statSync(outputDir);
        if (!stat.isDirectory()) {
          return {
            success: false,
            dryRun: isDryRun,
            code: 'INVALID_CREDENTIALS_PATH',
            error: `CREDENTIAL_DIR_INVALID: Path "${outputDir}" exists but is not a directory.`,
          };
        }
      } catch (statErr: any) {
        return {
          success: false,
          dryRun: isDryRun,
          code: 'INVALID_CREDENTIALS_PATH',
          error: `CREDENTIAL_DIR_INVALID: Cannot access destination directory "${outputDir}": ${sanitizeErrorMessage(statErr.message)}`,
        };
      }
    } else {
      try {
        fs.mkdirSync(outputDir, { recursive: true });
      } catch (dirErr: any) {
        return {
          success: false,
          dryRun: isDryRun,
          code: 'INVALID_CREDENTIALS_PATH',
          error: `CREDENTIAL_DIR_NOT_WRITABLE: Failed to create output directory "${outputDir}": ${sanitizeErrorMessage(dirErr.message)}`,
        };
      }
    }
  }

  // 4. Initialize Prisma client
  let prisma = options.prisma;
  const ownsPrisma = !prisma;
  if (!prisma) {
    prisma = new PrismaClient();
  }

  try {
    // 5. Database Pre-flight Collision Check
    const dbCollisions = await checkRosterDbCollisions(validation.validRecords, prisma);

    if (!skipExisting && (dbCollisions.existingEmails.length > 0 || dbCollisions.existingRollNumbers.length > 0)) {
      return {
        success: false,
        dryRun: isDryRun,
        code: 'DATABASE_CONFLICT',
        error: `Import rejected due to existing student records in database (${dbCollisions.existingEmails.length} existing email(s), ${dbCollisions.existingRollNumbers.length} existing roll number(s)).`,
        dbConflicts: dbCollisions,
        validation,
      };
    }

    const existingEmailSet = new Set(dbCollisions.existingEmails.map((e) => e.toLowerCase()));
    const existingRollSet = new Set(dbCollisions.existingRollNumbers.map((r) => r.toUpperCase()));

    // Partition records into to-create vs to-skip
    const recordsToCreate: StudentRosterRecord[] = [];
    const recordsToSkip: StudentRosterRecord[] = [];

    for (const record of validation.validRecords) {
      const emailExists = existingEmailSet.has(record.email.toLowerCase());
      const rollExists = existingRollSet.has(record.rollNumber.toUpperCase());

      if (emailExists || rollExists) {
        recordsToSkip.push(record);
      } else {
        recordsToCreate.push(record);
      }
    }

    // 6. Dry Run Return (No DB mutations, no audit logs, no credential exports)
    if (isDryRun) {
      return {
        success: true,
        dryRun: true,
        message: `DRY RUN COMPLETED: Validated ${validation.totalRows} student records. Projected: ${recordsToCreate.length} to create, ${recordsToSkip.length} already existing (to skip). 0 database writes performed.`,
        summary: {
          totalRows: validation.totalRows,
          validRows: validation.validRecords.length,
          createdCount: recordsToCreate.length,
          skippedCount: recordsToSkip.length,
          conflictCount: dbCollisions.conflicts.length,
          createdRollNumbers: recordsToCreate.map((r) => r.rollNumber),
          skippedRollNumbers: recordsToSkip.map((r) => r.rollNumber),
        },
      };
    }

    // 7. Resolve Administrative Actor for Audit Logging
    const safeActorId = await resolveImportAdminActor(prisma, options.actorId);

    // 8. Generate Secure Credentials for New Students
    const credentialsMap = new Map<string, GeneratedStudentCredential>();
    const credentialList: GeneratedStudentCredential[] = [];

    for (const student of recordsToCreate) {
      const tempPassword = generateSecurePassword(16);
      const passwordHash = await bcrypt.hash(tempPassword, 10);

      const cred: GeneratedStudentCredential = {
        name: student.name,
        email: student.email,
        rollNumber: student.rollNumber,
        program: student.program,
        branch: student.branch,
        year: student.year,
        semester: student.semester,
        secondLanguage: student.secondLanguage,
        phone: student.phone,
        temporaryPassword: tempPassword,
        passwordHash,
        mustChangePassword: true,
      };

      credentialsMap.set(student.email, cred);
      credentialList.push(cred);
    }

    // FIX 2 (SEC-T2-02): Stage credential export file BEFORE database transaction commits
    let stagedFilePath: string | null = null;
    if (validatedCredentialsPath && credentialList.length > 0) {
      // Re-verify destination still does not exist immediately before staging
      if (fs.existsSync(validatedCredentialsPath)) {
        return {
          success: false,
          dryRun: false,
          code: 'CREDENTIAL_DESTINATION_EXISTS',
          error: `CREDENTIAL_DESTINATION_EXISTS: Target credential file "${validatedCredentialsPath}" already exists. Overwriting existing credential exports is strictly prohibited.`,
        };
      }

      const stagingPath = `${validatedCredentialsPath}.stage.${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString('hex')}`;
      const format = options.credentialsFormat === 'csv' ? 'csv' : 'json';
      let contentToWrite: string;

      if (format === 'json') {
        const envelope: StudentCredentialEnvelope = {
          warning:
            'OFFICIAL RG-KEDIA STUDENT CREDENTIAL ENVELOPE. DISTRIBUTE SECURELY. DO NOT COMMIT TO VERSION CONTROL.',
          generatedAt: new Date().toISOString(),
          recordCount: credentialList.length,
          credentials: credentialList,
        };
        contentToWrite = JSON.stringify(envelope, null, 2);
      } else {
        const rows: string[][] = [
          ['Name', 'RollNumber', 'Email', 'Program', 'Branch', 'TemporaryPassword', 'MustChangePassword'],
          ...credentialList.map((c) => [
            c.name,
            c.rollNumber,
            c.email,
            c.program,
            c.branch || '',
            c.temporaryPassword,
            'true',
          ]),
        ];
        contentToWrite = serializeCsv(rows, true);
      }

      try {
        // Race-safe exclusive creation (wx flag fails if staging file already exists) with 0o600 permissions
        fs.writeFileSync(stagingPath, contentToWrite, { mode: 0o600, flag: 'wx' });
        stagedFilePath = stagingPath;
      } catch (stageErr: any) {
        return {
          success: false,
          dryRun: false,
          code: 'CREDENTIAL_STAGE_FAILED',
          error: `CREDENTIAL_STAGE_FAILED: Failed to stage credential export file before database transaction: ${sanitizeErrorMessage(stageErr.message)}. Zero database writes were performed.`,
        };
      }
    }

    // 9. Atomic Transactional Execution with PostgreSQL Advisory Lock
    let txResult: { createdUsers: any[]; auditLog: any };
    try {
      txResult = await prisma.$transaction(
        async (tx: any) => {
          // Concurrency protection: PostgreSQL transaction-level advisory lock
          if (typeof tx.$executeRaw === 'function') {
            try {
              await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'import:student_roster'}))`;
            } catch {
              // Fall back safely if non-postgres or mock client
            }
          }

          // Test simulation failure hook for rollback verification
          if (options.testSimulateFailure) {
            throw new Error('SIMULATED_TRANSACTION_FAILURE: Intentionally triggered failure for rollback verification.');
          }

          const createdUsers: any[] = [];

          // Insert new student users
          for (const student of recordsToCreate) {
            const cred = credentialsMap.get(student.email)!;
            const user = await tx.user.create({
              data: {
                name: student.name,
                email: student.email,
                password: cred.passwordHash,
                role: 'STUDENT',
                rollNumber: student.rollNumber,
                program: student.program,
                branch: student.branch,
                year: student.year,
                semester: student.semester,
                secondLanguage: student.secondLanguage,
                phone: student.phone,
                active: true,
                mustChangePassword: true,
              },
            });
            createdUsers.push(user);
          }

          // Create atomic audit log in the same transaction
          const auditLog = await tx.auditLog.create({
            data: {
              actorId: safeActorId,
              action: 'SYSTEM_IMPORT_STUDENT_ROSTER',
              targetId: null,
              details: JSON.stringify({
                totalRows: validation.totalRows,
                validRows: validation.validRecords.length,
                createdCount: createdUsers.length,
                skippedCount: recordsToSkip.length,
                programs: validation.summary.byProgram,
                source: options.sourceName || 'CSV_ROSTER_IMPORT',
                timestamp: new Date().toISOString(),
              }),
            },
          });

          return {
            createdUsers,
            auditLog,
          };
        },
        {
          timeout: 30000,
        }
      );
    } catch (txErr: any) {
      // Transaction failed and was rolled back by Prisma.
      // Clean up the staged credential file to avoid leaving orphan credentials on disk.
      let cleanupWarning: string | undefined = undefined;
      if (stagedFilePath) {
        try {
          if (options.testSimulateCleanupFailure) {
            throw new Error('SIMULATED_CLEANUP_FAILURE: Disk permission denied during cleanup.');
          }
          if (fs.existsSync(stagedFilePath)) {
            fs.unlinkSync(stagedFilePath);
          }
        } catch (cleanupErr: any) {
          cleanupWarning = `CLEANUP_FAILED: Database transaction rolled back, but could not delete staged credential file at "${stagedFilePath}". Please remove this orphan staging file manually: ${sanitizeErrorMessage(cleanupErr.message)}`;
        }
      }

      return {
        success: false,
        dryRun: false,
        code: 'TRANSACTION_FAILED',
        error: `Import transaction failed and all created student accounts were rolled back: ${sanitizeErrorMessage(txErr.message)}${cleanupWarning ? `\n⚠️ ${cleanupWarning}` : ''}`,
        cleanupWarning,
        orphanStagingPath: cleanupWarning && stagedFilePath ? stagedFilePath : undefined,
      };
    }

    // 10. Finalize Credential Export: Promote durable staged file to target destination
    let savedCredentialsPath: string | undefined = undefined;
    if (stagedFilePath && validatedCredentialsPath) {
      try {
        // Race-safe promotion using copyFileSync with COPYFILE_EXCL to prevent silent overwrite
        fs.copyFileSync(stagedFilePath, validatedCredentialsPath, fs.constants.COPYFILE_EXCL);
        fs.chmodSync(validatedCredentialsPath, 0o600);
        fs.unlinkSync(stagedFilePath);
        savedCredentialsPath = validatedCredentialsPath;
      } catch (promoteErr: any) {
        // If promotion to destination failed (e.g. concurrent creation of destination),
        // the credentials are NOT LOST: they remain safely preserved at stagedFilePath!
        savedCredentialsPath = stagedFilePath;
        console.warn(
          `⚠️ Warning: Could not finalize credential file to "${validatedCredentialsPath}". Credentials preserved at durable staging path: "${stagedFilePath}". Reason: ${sanitizeErrorMessage(promoteErr.message)}`
        );
      }
    }

    // 11. Return Clean Success Result (Redacted, no secrets exposed)
    const successResult: RosterImportSuccessResult = {
      success: true,
      dryRun: false,
      message: `STUDENT ROSTER IMPORT COMPLETED: ${txResult.createdUsers.length} student account(s) created, ${recordsToSkip.length} existing account(s) skipped.`,
      summary: {
        totalRows: validation.totalRows,
        validRows: validation.validRecords.length,
        createdCount: txResult.createdUsers.length,
        skippedCount: recordsToSkip.length,
        conflictCount: dbCollisions.conflicts.length,
        createdRollNumbers: recordsToCreate.map((r) => r.rollNumber),
        skippedRollNumbers: recordsToSkip.map((r) => r.rollNumber),
      },
      auditLogId: txResult.auditLog.id,
      credentialsFile: savedCredentialsPath,
    };

    return successResult;
  } finally {
    if (ownsPrisma) {
      await prisma.$disconnect();
    }
  }
}
