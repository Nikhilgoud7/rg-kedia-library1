// tests/suites/studentRosterImport.test.js — Production Student Roster Import Test Suite
import os from 'os';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { TestDataManager } from '../helpers/testData.js';
import {
  validateRosterCsv,
  checkRosterDbCollisions,
} from '../../dist/server/lib/roster/rosterValidator.js';
import {
  executeStudentRosterImport,
  resolveImportAdminActor,
  sanitizeErrorMessage,
} from '../../dist/server/lib/roster/rosterImportEngine.js';

export async function runStudentRosterImportTests(baseUrl, assert) {
  const dataManager = new TestDataManager();
  const prisma = dataManager.prisma;
  const tempDir = os.tmpdir();

  try {
    // Setup: Ensure an active librarian exists for audit logging
    const librarian = await dataManager.createUser({
      role: 'LIBRARIAN',
      active: true,
      tag: 'roster_admin',
    });

    const sessionTag = crypto.randomBytes(3).toString('hex');
    const randRoll = (slot) => `1052-24-${slot}-${Math.floor(100 + Math.random() * 899)}`;

    // =========================================================================
    // 1. CSV VALIDATION & PARSING (Conditions 1-5, 10)
    // =========================================================================

    // 1.1 Valid CSV with complete attributes
    {
      const csv = `Name,RollNumber,Email,Program,Branch,Year,Semester,SecondLanguage,Phone
Ananya Reddy,1052-24-401-001,ananya_${sessionTag}@rgkedia.edu.in,BCOM,Computer Applications,1,1,TELUGU,9849012345
Rahul Varma,1052-24-402-002,rahul_${sessionTag}@rgkedia.edu.in,BBA,General,1,2,HINDI,9849012346`;

      const res = validateRosterCsv(csv);
      assert(res.isValid === true, 'Condition 1: Valid CSV passes validation');
      assert(res.totalRows === 2, 'Condition 1: Correct totalRows parsed');
      assert(res.validRecords.length === 2, 'Condition 1: Both records parsed as valid');
      assert(res.validRecords[0].name === 'Ananya Reddy', 'Condition 1: Record name matches');
      assert(res.validRecords[0].rollNumber === '1052-24-401-001', 'Condition 1: Roll number matches');
      assert(res.validRecords[0].program === 'BCOM', 'Condition 1: Program matches');
      assert(res.validRecords[0].secondLanguage === 'TELUGU', 'Condition 1: Second language matches');
      assert(res.validRecords[0].year === 1 && res.validRecords[0].semester === 1, 'Condition 1: Year and semester match');
    }

    // 1.2 UTF-8 BOM Support
    {
      const csvWithBom = `\uFEFFName,RollNumber,Email,Program,Branch,Year,Semester,SecondLanguage,Phone
Sneha Rao,1052-24-403-003,sneha_${sessionTag}@rgkedia.edu.in,BSC,Mathematics,1,1,SANSKRIT,9849012347`;

      const res = validateRosterCsv(csvWithBom);
      assert(res.isValid === true, 'Condition 2: UTF-8 BOM CSV passes validation');
      assert(res.validRecords.length === 1, 'Condition 2: Record parsed after stripping BOM');
      assert(res.validRecords[0].name === 'Sneha Rao', 'Condition 2: Header parsed cleanly without BOM artifact');
    }

    // 1.3 Quoted fields and embedded commas
    {
      const csvQuoted = `Name,RollNumber,Email,Program,Branch,Year,Semester,SecondLanguage,Phone
"Kedia, Vikram",1052-24-401-004,vikram_${sessionTag}@rgkedia.edu.in,BCOM,"Business, Analytics & Finance",2,3,TELUGU,9849012348`;

      const res = validateRosterCsv(csvQuoted);
      assert(res.isValid === true, 'Condition 3: Quoted fields with embedded commas pass validation');
      assert(res.validRecords[0].name === 'Kedia, Vikram', 'Condition 3: Embedded comma in name preserved');
      assert(res.validRecords[0].branch === 'Business, Analytics & Finance', 'Condition 3: Embedded comma in branch preserved');
    }

    // 1.4 Missing mandatory columns
    {
      const missingNameCol = `RollNumber,Email,Program
1052-24-401-005,test_${sessionTag}@rgkedia.edu.in,BCOM`;
      const res = validateRosterCsv(missingNameCol);
      assert(res.isValid === false, 'Condition 4: Fails when Name column is missing');
      assert(
        res.errors.some((e) => e.code === 'MISSING_REQUIRED_HEADERS' && e.message.includes('Name')),
        'Condition 4: Identifies missing Name column in header'
      );

      const missingRollCol = `Name,Email,Program
Student Name,test_${sessionTag}@rgkedia.edu.in,BCOM`;
      const resRoll = validateRosterCsv(missingRollCol);
      assert(resRoll.isValid === false, 'Condition 4: Fails when RollNumber column is missing');
      assert(
        resRoll.errors.some((e) => e.code === 'MISSING_REQUIRED_HEADERS' && e.message.includes('RollNumber')),
        'Condition 4: Identifies missing RollNumber column in header'
      );
    }

    // 1.5 Missing mandatory values on rows & Row-specific error reporting (Condition 5 & 10)
    {
      const csvMissingValues = `Name,RollNumber,Email,Program
,1052-24-401-006,valid_${sessionTag}@rgkedia.edu.in,BCOM
Valid Student,,valid2_${sessionTag}@rgkedia.edu.in,BCOM
Valid Student 3,1052-24-401-008,,BCOM`;

      const res = validateRosterCsv(csvMissingValues);
      assert(res.isValid === false, 'Condition 5: Fails when rows have missing mandatory values');
      assert(res.errors.length >= 3, 'Condition 10: Reports errors for all invalid rows');

      const nameErr = res.errors.find((e) => e.row === 2 && e.field === 'name');
      assert(nameErr && nameErr.code === 'REQUIRED_FIELD_MISSING', 'Condition 10: Row 2 has missing name error');

      const rollErr = res.errors.find((e) => e.row === 3 && e.field === 'rollNumber');
      assert(rollErr && rollErr.code === 'REQUIRED_FIELD_MISSING', 'Condition 10: Row 3 has missing roll number error');

      const emailErr = res.errors.find((e) => e.row === 4 && e.field === 'email');
      assert(emailErr && emailErr.code === 'REQUIRED_FIELD_MISSING', 'Condition 10: Row 4 has missing email error');
    }

    // =========================================================================
    // 2. INTRA-FILE DUPLICATES & ACADEMIC CONSISTENCY (Conditions 6-7)
    // =========================================================================

    // 2.1 Intra-file duplicate roll numbers
    {
      const csvDupRoll = `Name,RollNumber,Email,Program
Student One,1052-24-401-010,student1_${sessionTag}@rgkedia.edu.in,BCOM
Student Two,1052-24-401-010,student2_${sessionTag}@rgkedia.edu.in,BCOM`;

      const res = validateRosterCsv(csvDupRoll);
      assert(res.isValid === false, 'Condition 6: Intra-file duplicate roll number rejected');
      const dupErr = res.errors.find((e) => e.code === 'DUPLICATE_ROLL_NUMBER_IN_FILE');
      assert(dupErr && dupErr.row === 3, 'Condition 6: Flags duplicate roll number on row 3');
      assert(res.summary.duplicateRollNumbers === 1, 'Condition 6: Duplicate roll numbers counted in summary');
    }

    // 2.2 Intra-file duplicate emails
    {
      const csvDupEmail = `Name,RollNumber,Email,Program
Student A,1052-24-401-011,shared_${sessionTag}@rgkedia.edu.in,BCOM
Student B,1052-24-401-012,shared_${sessionTag}@rgkedia.edu.in,BCOM`;

      const res = validateRosterCsv(csvDupEmail);
      assert(res.isValid === false, 'Condition 7: Intra-file duplicate email rejected');
      const dupErr = res.errors.find((e) => e.code === 'DUPLICATE_EMAIL_IN_FILE');
      assert(dupErr && dupErr.row === 3, 'Condition 7: Flags duplicate email on row 3');
      assert(res.summary.duplicateEmails === 1, 'Condition 7: Duplicate emails counted in summary');
    }

    // 2.3 Academic Year-to-Semester mismatch
    {
      const csvMismatch = `Name,RollNumber,Email,Program,Year,Semester
Student Mismatch,1052-24-401-013,mismatch_${sessionTag}@rgkedia.edu.in,BCOM,1,4`;

      const res = validateRosterCsv(csvMismatch);
      assert(res.isValid === false, 'Academic mismatch rejected');
      const misErr = res.errors.find((e) => e.code === 'ACADEMIC_YEAR_SEMESTER_MISMATCH');
      assert(misErr && misErr.row === 2, 'Flags ACADEMIC_YEAR_SEMESTER_MISMATCH on row 2');
    }

    // =========================================================================
    // 3. DATABASE CONFLICTS & DRY-RUN GUARANTEES (Conditions 8-9, 11)
    // =========================================================================

    // Setup an existing student in database for collision checks
    const existingStudentRoll = randRoll('410');
    const existingStudentEmail = `existing_${sessionTag}@rgkedia.edu.in`;
    const existingStudent = await prisma.user.create({
      data: {
        name: 'Pre-existing Student',
        email: existingStudentEmail,
        password: await dataManager.getPasswordHash(),
        role: 'STUDENT',
        rollNumber: existingStudentRoll,
        program: 'BCOM',
        active: true,
      },
    });
    dataManager.createdUserIds.add(existingStudent.id);

    // 3.1 Existing database roll-number conflict when skipExisting is false
    {
      const csvConflictRoll = `Name,RollNumber,Email,Program
New Student,${existingStudentRoll},new_email_${sessionTag}@rgkedia.edu.in,BCOM`;

      const res = await executeStudentRosterImport({
        csvText: csvConflictRoll,
        skipExisting: false,
        prisma,
      });

      assert(res.success === false, 'Condition 8: Rejects existing database roll number when skipExisting=false');
      assert(res.code === 'DATABASE_CONFLICT', 'Condition 8: Returns DATABASE_CONFLICT error code');
    }

    // 3.2 Existing database email conflict when skipExisting is false
    {
      const csvConflictEmail = `Name,RollNumber,Email,Program
New Student,${randRoll('411')},${existingStudentEmail},BCOM`;

      const res = await executeStudentRosterImport({
        csvText: csvConflictEmail,
        skipExisting: false,
        prisma,
      });

      assert(res.success === false, 'Condition 9: Rejects existing database email when skipExisting=false');
      assert(res.code === 'DATABASE_CONFLICT', 'Condition 9: Returns DATABASE_CONFLICT error code');
    }

    // 3.3 Dry-Run performs zero database writes (Condition 11)
    {
      const countUsersBefore = await prisma.user.count();
      const countAuditBefore = await prisma.auditLog.count();

      const dryRunRoll = randRoll('412');
      const dryRunEmail = `dryrun_${sessionTag}@rgkedia.edu.in`;
      const csvDryRun = `Name,RollNumber,Email,Program,Year,Semester
Dry Run Student,${dryRunRoll},${dryRunEmail},BCOM,1,1`;

      const res = await executeStudentRosterImport({
        csvText: csvDryRun,
        dryRun: true,
        prisma,
      });

      assert(res.success === true, 'Condition 11: Dry-run returns success result');
      assert(res.dryRun === true, 'Condition 11: Marks result as dryRun=true');
      assert(res.summary.createdCount === 1, 'Condition 11: Projects 1 account to create');

      const countUsersAfter = await prisma.user.count();
      const countAuditAfter = await prisma.auditLog.count();
      assert(countUsersAfter === countUsersBefore, 'Condition 11: User count unchanged after dry-run (0 writes)');
      assert(countAuditAfter === countAuditBefore, 'Condition 11: Audit log count unchanged after dry-run (0 writes)');

      // Verify user was not created
      const searchUser = await prisma.user.findUnique({ where: { email: dryRunEmail } });
      assert(searchUser === null, 'Condition 11: Dry-run student record does not exist in database');
    }

    // =========================================================================
    // 4. PRODUCTION CONFIRMATION & LIVE IMPORT (Conditions 12-13, 16-17)
    // =========================================================================

    // 4.1 Production Confirmation Safeguard (Condition 12)
    {
      const liveRoll = randRoll('413');
      const liveEmail = `prod_test_${sessionTag}@rgkedia.edu.in`;
      const csvProd = `Name,RollNumber,Email,Program
Prod Student,${liveRoll},${liveEmail},BCOM`;

      // In production without --confirm, must fail closed
      const resBlocked = await executeStudentRosterImport({
        csvText: csvProd,
        dryRun: false,
        confirmProduction: false,
        env: { NODE_ENV: 'production' },
        prisma,
      });

      assert(resBlocked.success === false, 'Condition 12: Blocks unconfirmed live import in production');
      assert(
        resBlocked.code === 'ROSTER_IMPORT_CONFIRMATION_REQUIRED',
        'Condition 12: Returns ROSTER_IMPORT_CONFIRMATION_REQUIRED'
      );

      // Verify no user was created
      const searchUser = await prisma.user.findUnique({ where: { email: liveEmail } });
      assert(searchUser === null, 'Condition 12: Confirms zero writes when production confirmation is missing');
    }

    // 4.2 Live Authorized Import (Conditions 16, 17)
    let liveStudentId = '';
    const liveStudentRoll = randRoll('414');
    const liveStudentEmail = `live_${sessionTag}@rgkedia.edu.in`;
    const credentialsExportPath = path.join(tempDir, `credentials_test_${sessionTag}.json`);

    {
      const csvLive = `Name,RollNumber,Email,Program,Branch,Year,Semester,SecondLanguage,Phone
Live Student,${liveStudentRoll},${liveStudentEmail},BCOM,Computer Applications,2,3,TELUGU,9849012350`;

      const res = await executeStudentRosterImport({
        csvText: csvLive,
        dryRun: false,
        confirmProduction: true,
        actorId: librarian.id,
        credentialsOutputPath: credentialsExportPath,
        prisma,
      });

      assert(res.success === true, 'Live import succeeds with confirmation');
      assert(res.summary.createdCount === 1, 'Summary reports 1 account created');
      assert(res.summary.skippedCount === 0, 'Summary reports 0 accounts skipped');
      assert(Boolean(res.auditLogId), 'Condition 16: Returns auditLogId');

      // Verify student in DB
      const dbStudent = await prisma.user.findUnique({ where: { email: liveStudentEmail } });
      assert(Boolean(dbStudent), 'Created student exists in database');
      liveStudentId = dbStudent.id;
      dataManager.createdUserIds.add(dbStudent.id);

      assert(dbStudent.role === 'STUDENT', 'Created student has role STUDENT');
      assert(dbStudent.rollNumber === liveStudentRoll, 'Created student has correct roll number');
      assert(dbStudent.program === 'BCOM', 'Created student has correct program');
      assert(dbStudent.branch === 'Computer Applications', 'Created student has correct branch');
      assert(dbStudent.year === 2 && dbStudent.semester === 3, 'Created student has correct year and semester');
      assert(dbStudent.secondLanguage === 'TELUGU', 'Created student has correct second language');
      assert(dbStudent.phone === '9849012350', 'Created student has correct phone');
      assert(dbStudent.active === true, 'Created student is active');
      assert(dbStudent.mustChangePassword === true, 'Created student has mustChangePassword=true');

      // Verify audit event details
      const auditLog = await prisma.auditLog.findUnique({ where: { id: res.auditLogId } });
      assert(Boolean(auditLog), 'Condition 16: Audit log record found in database');
      assert(auditLog.action === 'SYSTEM_IMPORT_STUDENT_ROSTER', 'Condition 16: Action is SYSTEM_IMPORT_STUDENT_ROSTER');
      assert(auditLog.actorId === librarian.id, 'Condition 16: Actor is the authorized librarian');

      // Condition 17: No password or hash leakage
      const resultString = JSON.stringify(res);
      assert(!resultString.includes('passwordHash'), 'Condition 17: Result does not contain passwordHash');
      assert(!resultString.includes('temporaryPassword'), 'Condition 17: Result does not contain temporaryPassword');

      const auditDetails = auditLog.details || '';
      assert(!auditDetails.includes('password'), 'Condition 17: Audit log details do not contain passwords');
      assert(!auditDetails.includes('hash'), 'Condition 17: Audit log details do not contain password hashes');

      // Verify credentials export file was written safely outside repo
      assert(fs.existsSync(credentialsExportPath), 'Credentials export file was created in temp directory');
      const credFileContent = JSON.parse(fs.readFileSync(credentialsExportPath, 'utf8'));
      assert(credFileContent.recordCount === 1, 'Credentials envelope contains 1 credential');
      assert(credFileContent.credentials[0].email === liveStudentEmail, 'Credential envelope matches student email');
      assert(Boolean(credFileContent.credentials[0].temporaryPassword), 'Credential envelope contains temporary password');

      // Clean up temp credential file
      try {
        fs.unlinkSync(credentialsExportPath);
      } catch {}
    }

    // 4.3 Repeated Import Idempotency (Condition 13)
    {
      const csvRepeat = `Name,RollNumber,Email,Program,Branch,Year,Semester,SecondLanguage,Phone
Live Student,${liveStudentRoll},${liveStudentEmail},BCOM,Computer Applications,2,3,TELUGU,9849012350`;

      const res = await executeStudentRosterImport({
        csvText: csvRepeat,
        dryRun: false,
        skipExisting: true, // Idempotent skip
        actorId: librarian.id,
        prisma,
      });

      assert(res.success === true, 'Condition 13: Repeated import succeeds idempotently');
      assert(res.summary.createdCount === 0, 'Condition 13: 0 new accounts created on duplicate re-run');
      assert(res.summary.skippedCount === 1, 'Condition 13: 1 existing account skipped');
      assert(
        res.summary.skippedRollNumbers.includes(liveStudentRoll),
        'Condition 13: Skipped roll numbers list includes student'
      );
    }

    // =========================================================================
    // 5. TRANSACTION ROLLBACK & CONCURRENCY (Conditions 14-15, 18)
    // =========================================================================

    // 5.1 Transaction Rollback on Failure (Condition 15)
    {
      const failRoll = randRoll('415');
      const failEmail = `rollback_${sessionTag}@rgkedia.edu.in`;
      const csvRollback = `Name,RollNumber,Email,Program
Rollback Student,${failRoll},${failEmail},BCOM`;

      const res = await executeStudentRosterImport({
        csvText: csvRollback,
        dryRun: false,
        actorId: librarian.id,
        testSimulateFailure: true, // Triggers simulated error inside transaction
        prisma,
      });

      assert(res.success === false, 'Condition 15: Simulated failure returns failure result');
      assert(res.code === 'TRANSACTION_FAILED', 'Condition 15: Returns TRANSACTION_FAILED code');

      // Verify that user was NOT created in database (rolled back)
      const rolledBackUser = await prisma.user.findUnique({ where: { email: failEmail } });
      assert(rolledBackUser === null, 'Condition 15: Transaction rollback verified, user was not persisted');
    }

    // 5.2 Concurrent Import Protection via Advisory Lock (Condition 14)
    {
      const concRoll1 = randRoll('416');
      const concEmail1 = `conc1_${sessionTag}@rgkedia.edu.in`;
      const concRoll2 = randRoll('417');
      const concEmail2 = `conc2_${sessionTag}@rgkedia.edu.in`;

      const csvConc1 = `Name,RollNumber,Email,Program\nConcurrent 1,${concRoll1},${concEmail1},BCOM`;
      const csvConc2 = `Name,RollNumber,Email,Program\nConcurrent 2,${concRoll2},${concEmail2},BCOM`;

      // Execute two imports concurrently
      const [res1, res2] = await Promise.all([
        executeStudentRosterImport({ csvText: csvConc1, dryRun: false, actorId: librarian.id, prisma }),
        executeStudentRosterImport({ csvText: csvConc2, dryRun: false, actorId: librarian.id, prisma }),
      ]);

      assert(res1.success === true && res2.success === true, 'Condition 14: Both concurrent imports succeed serialized');

      const u1 = await prisma.user.findUnique({ where: { email: concEmail1 } });
      const u2 = await prisma.user.findUnique({ where: { email: concEmail2 } });
      assert(Boolean(u1) && Boolean(u2), 'Condition 14: Both concurrent students persisted safely');
      if (u1) dataManager.createdUserIds.add(u1.id);
      if (u2) dataManager.createdUserIds.add(u2.id);
    }

    // 5.3 Credential Output Path Security Guardrail
    {
      const invalidPathInsideRepo = path.join(process.cwd(), 'leaked_credentials.json');
      const csvSec = `Name,RollNumber,Email,Program\nSec Student,1052-24-401-108,sec_${sessionTag}@rgkedia.edu.in,BCOM`;

      const res = await executeStudentRosterImport({
        csvText: csvSec,
        dryRun: false,
        credentialsOutputPath: invalidPathInsideRepo,
        prisma,
      });

      assert(res.success === false, 'Blocks credentials export inside repository root');
      assert(res.code === 'INVALID_CREDENTIALS_PATH', 'Returns INVALID_CREDENTIALS_PATH error code');
      assert(
        res.error.includes('CREDENTIAL_OUTPUT_INSIDE_REPO_FORBIDDEN'),
        'Identifies CREDENTIAL_OUTPUT_INSIDE_REPO_FORBIDDEN'
      );
    }

    // 5.4 Existing user and library data preservation (Condition 18)
    {
      const existingLibrarianCheck = await prisma.user.findUnique({ where: { id: librarian.id } });
      assert(Boolean(existingLibrarianCheck), 'Condition 18: Librarian record preserved');
      assert(existingLibrarianCheck.role === 'LIBRARIAN', 'Condition 18: Librarian role preserved');

      const existingStudentCheck = await prisma.user.findUnique({ where: { id: existingStudent.id } });
      assert(Boolean(existingStudentCheck), 'Condition 18: Pre-existing student record preserved');
      assert(existingStudentCheck.rollNumber === existingStudentRoll, 'Condition 18: Pre-existing student roll number preserved');
    }

    // =========================================================================
    // 6. SECURITY REMEDIATION TESTS (SEC-T2-01, SEC-T2-02, SEC-T2-04)
    // =========================================================================

    // 6.1 SEC-T2-01: Overwrite Protection — Target destination file already exists
    {
      const existingCredsPath = path.join(tempDir, `existing_creds_${sessionTag}.json`);
      fs.writeFileSync(existingCredsPath, 'EXISTING_PRESERVED_CONTENT', 'utf8');

      const overwriteRoll = randRoll('420');
      const overwriteEmail = `overwrite_${sessionTag}@rgkedia.edu.in`;
      const csvOverwrite = `Name,RollNumber,Email,Program\nOverwrite Student,${overwriteRoll},${overwriteEmail},BCOM`;

      const res = await executeStudentRosterImport({
        csvText: csvOverwrite,
        dryRun: false,
        actorId: librarian.id,
        credentialsOutputPath: existingCredsPath,
        prisma,
      });

      assert(res.success === false, 'SEC-T2-01: Rejects import when destination credential file already exists');
      assert(res.code === 'CREDENTIAL_DESTINATION_EXISTS', 'SEC-T2-01: Returns CREDENTIAL_DESTINATION_EXISTS code');
      assert(
        res.error.includes('Overwriting existing credential exports is strictly prohibited'),
        'SEC-T2-01: Error message explicitly cites overwrite prohibition'
      );

      // Verify existing file content was NOT overwritten
      const preservedContent = fs.readFileSync(existingCredsPath, 'utf8');
      assert(preservedContent === 'EXISTING_PRESERVED_CONTENT', 'SEC-T2-01: Existing file content remained untouched');

      // Verify account was NOT created
      const searchUser = await prisma.user.findUnique({ where: { email: overwriteEmail } });
      assert(searchUser === null, 'SEC-T2-01: Zero accounts created when destination file exists');

      // Cleanup
      try {
        fs.unlinkSync(existingCredsPath);
      } catch {}
    }

    // 6.2 SEC-T2-02: Invalid / Unwritable directory fails closed before database writes
    {
      const invalidDirPath = path.join(tempDir, 'nonexistent_test_subfolder_' + sessionTag, 'creds.json');
      // Create a file where the directory would be so mkdir fails with EEXIST / ENOTDIR
      const blockerFile = path.dirname(invalidDirPath);
      fs.writeFileSync(blockerFile, 'BLOCKER', 'utf8');

      const unwriteRoll = randRoll('421');
      const unwriteEmail = `unwrite_${sessionTag}@rgkedia.edu.in`;
      const csvUnwrite = `Name,RollNumber,Email,Program\nUnwrite Student,${unwriteRoll},${unwriteEmail},BCOM`;

      const res = await executeStudentRosterImport({
        csvText: csvUnwrite,
        dryRun: false,
        actorId: librarian.id,
        credentialsOutputPath: invalidDirPath,
        prisma,
      });

      assert(res.success === false, 'SEC-T2-02: Rejects import when output directory cannot be created');
      assert(res.code === 'INVALID_CREDENTIALS_PATH', 'SEC-T2-02: Returns INVALID_CREDENTIALS_PATH code');

      // Verify account was NOT created
      const searchUser = await prisma.user.findUnique({ where: { email: unwriteEmail } });
      assert(searchUser === null, 'SEC-T2-02: Zero accounts created when directory is invalid');

      // Cleanup blocker
      try {
        fs.unlinkSync(blockerFile);
      } catch {}
    }

    // 6.3 SEC-T2-02: Staging cleanup upon database transaction rollback
    {
      const stageCleanupPath = path.join(tempDir, `stage_cleanup_${sessionTag}.json`);
      const stageRoll = randRoll('422');
      const stageEmail = `stage_fail_${sessionTag}@rgkedia.edu.in`;
      const csvStageFail = `Name,RollNumber,Email,Program\nStage Fail Student,${stageRoll},${stageEmail},BCOM`;

      const res = await executeStudentRosterImport({
        csvText: csvStageFail,
        dryRun: false,
        actorId: librarian.id,
        credentialsOutputPath: stageCleanupPath,
        testSimulateFailure: true, // Triggers rollback inside transaction
        prisma,
      });

      assert(res.success === false, 'SEC-T2-02: Returns failure on simulated transaction error');
      assert(res.code === 'TRANSACTION_FAILED', 'SEC-T2-02: Returns TRANSACTION_FAILED code');

      // Verify destination was NOT created
      assert(!fs.existsSync(stageCleanupPath), 'SEC-T2-02: Final credential file was not created');

      // Verify no orphan staging file remains
      const stagedFiles = fs.readdirSync(tempDir).filter((f) => f.startsWith(`stage_cleanup_${sessionTag}.json.stage.`));
      assert(stagedFiles.length === 0, 'SEC-T2-02: Staged credential file was cleanly deleted on rollback');

      // Verify user was NOT created in DB
      const searchUser = await prisma.user.findUnique({ where: { email: stageEmail } });
      assert(searchUser === null, 'SEC-T2-02: Database changes rolled back cleanly');
    }

    // 6.4 SEC-T2-02: Safe recovery reporting when staging file cleanup fails
    {
      const cleanupFailPath = path.join(tempDir, `cleanup_fail_${sessionTag}.json`);
      const clnRoll = randRoll('423');
      const clnEmail = `cleanup_fail_${sessionTag}@rgkedia.edu.in`;
      const csvClnFail = `Name,RollNumber,Email,Program\nCln Fail Student,${clnRoll},${clnEmail},BCOM`;

      const res = await executeStudentRosterImport({
        csvText: csvClnFail,
        dryRun: false,
        actorId: librarian.id,
        credentialsOutputPath: cleanupFailPath,
        testSimulateFailure: true,
        testSimulateCleanupFailure: true, // Simulates OS permission error during staging cleanup
        prisma,
      });

      assert(res.success === false, 'SEC-T2-02: Returns failure on simulated transaction + cleanup failure');
      assert(Boolean(res.cleanupWarning), 'SEC-T2-02: Provides cleanupWarning in result');
      assert(
        res.cleanupWarning.includes('CLEANUP_FAILED'),
        'SEC-T2-02: Warning explicitly flags CLEANUP_FAILED'
      );
      assert(
        res.cleanupWarning.includes('Please remove this orphan staging file manually'),
        'SEC-T2-02: Warning gives clear instructions to remove orphan file'
      );
      assert(
        !res.cleanupWarning.includes('password') && !res.cleanupWarning.includes('hash'),
        'SEC-T2-02: Cleanup warning contains zero passwords or secrets'
      );

      // Clean up the orphan file from disk manually
      if (res.orphanStagingPath && fs.existsSync(res.orphanStagingPath)) {
        try {
          fs.unlinkSync(res.orphanStagingPath);
        } catch {}
      }
    }

    // 6.5 SEC-T2-04: Error message database connection string and password redaction
    {
      const rawPostgresError =
        'Connection refused at postgresql://librarian_user:SecretDbPassword456!@ep-xyz-1234.ap-southeast-1.neon.tech:5432/kedia_db?sslmode=require';
      const sanitized = sanitizeErrorMessage(rawPostgresError);

      assert(!sanitized.includes('SecretDbPassword456!'), 'SEC-T2-04: Password strictly redacted from error string');
      assert(sanitized.includes('<credentials-redacted>'), 'SEC-T2-04: Replaced with <credentials-redacted> token');
      assert(sanitized.includes('ep-xyz-1234.ap-southeast-1.neon.tech:5432'), 'SEC-T2-04: Host details preserved for diagnosis');

      const genericConnString = 'Database error: Error: connect ECONNREFUSED mysql://admin:SecretPass999@127.0.0.1:3306';
      const sanitizedGeneric = sanitizeErrorMessage(genericConnString);
      assert(!sanitizedGeneric.includes('SecretPass999'), 'SEC-T2-04: Generic connection password redacted');
      assert(sanitizedGeneric.includes('<credentials-redacted>'), 'SEC-T2-04: Generic replacement token inserted');
    }

  } finally {
    // Guaranteed cleanup of synthetic test data
    await dataManager.cleanup();
  }
}
