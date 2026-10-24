// tests/suites/syntheticCohort.test.js — Synthetic User Cohort Validation & Secure Credential Suite (Phase 9D)
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { createApiClient } from '../helpers/apiClient.js';
import {
  validateCredentialOutputPath,
  verifyPasswordStrength,
  generateSecurePassword,
  generateSyntheticCredentials,
} from '../../dist/server/lib/cohort/credentialGenerator.js';
import {
  validateSyntheticCohort,
  parseCohortInput,
} from '../../dist/server/lib/cohort/cohortValidator.js';
import {
  generateSyntheticCohort,
  seedSyntheticCohortToTestDb,
  cleanupSyntheticCohortFromTestDb,
} from '../../dist/server/lib/cohort/syntheticGenerator.js';

export async function runSyntheticCohortTests(baseUrl, assert) {
  const prisma = new PrismaClient();
  const repoRoot = path.resolve(process.cwd());
  const tempDir = path.resolve(os.tmpdir(), `rgk_cohort_test_${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  const createdFilePaths = [];
  const createdUserIds = [];

  try {
    // =========================================================================
    // 1. Repository Boundary Enforcement & Path Security (SEC-9D-01)
    // =========================================================================
    // 1.1 Path inside repo root must be strictly forbidden
    let insideRepoCaught = false;
    try {
      validateCredentialOutputPath('./credentials.json', repoRoot);
    } catch (err) {
      if (
        err.message.includes('CREDENTIAL_OUTPUT_INSIDE_REPO_FORBIDDEN') &&
        err.message.includes('must be outside the repository root')
      ) {
        insideRepoCaught = true;
      }
    }
    assert(
      insideRepoCaught,
      'validateCredentialOutputPath strictly rejects relative path inside repository root'
    );

    // 1.2 Subdirectory inside repo must also be rejected
    let subDirCaught = false;
    try {
      validateCredentialOutputPath(path.join(repoRoot, 'dist', 'secrets.json'), repoRoot);
    } catch (err) {
      if (err.message.includes('CREDENTIAL_OUTPUT_INSIDE_REPO_FORBIDDEN')) {
        subDirCaught = true;
      }
    }
    assert(
      subDirCaught,
      'validateCredentialOutputPath rejects absolute path inside repo subdirectory'
    );

    // 1.3 Path exactly matching repo root must be rejected
    let exactRepoCaught = false;
    try {
      validateCredentialOutputPath(repoRoot, repoRoot);
    } catch (err) {
      if (err.message.includes('CREDENTIAL_OUTPUT_INSIDE_REPO_FORBIDDEN')) {
        exactRepoCaught = true;
      }
    }
    assert(exactRepoCaught, 'validateCredentialOutputPath rejects repo root directory itself');

    // 1.4 Valid path outside repository root must be accepted and resolved
    const externalPath = path.resolve(tempDir, 'synthetic-credentials.json');
    const resolvedPath = validateCredentialOutputPath(externalPath, repoRoot);
    assert(
      resolvedPath === externalPath,
      'validateCredentialOutputPath allows and resolves valid path strictly outside repository'
    );

    // 1.5 Null or empty path must be rejected
    let emptyPathCaught = false;
    try {
      validateCredentialOutputPath('', repoRoot);
    } catch (err) {
      if (err.message.includes('INVALID_PATH')) {
        emptyPathCaught = true;
      }
    }
    assert(emptyPathCaught, 'validateCredentialOutputPath rejects empty path');

    // =========================================================================
    // 2. High-Entropy Password Generation & Bcrypt Verification (SEC-9D-02)
    // =========================================================================
    // 2.1 Default password length & complexity
    const pwd1 = generateSecurePassword();
    assert(pwd1.length === 16, 'generateSecurePassword creates 16-character password by default');
    const strength1 = verifyPasswordStrength(pwd1);
    assert(strength1.valid && strength1.errors.length === 0, 'Generated password passes all strength checks');
    assert(/[A-Z]/.test(pwd1), 'Generated password contains uppercase characters');
    assert(/[a-z]/.test(pwd1), 'Generated password contains lowercase characters');
    assert(/[0-9]/.test(pwd1), 'Generated password contains numeric digits');
    assert(/[!@#$%^&*()_+\-=[\]{}|;:,.<>?]/.test(pwd1), 'Generated password contains special symbols');

    // 2.2 Bcrypt byte limit compliance (<= 72 bytes)
    const byteLen = Buffer.byteLength(pwd1, 'utf8');
    assert(byteLen <= 72, 'Generated password byte length complies with bcrypt 72-byte max length limit');

    // 2.3 Password uniqueness / entropy check across 50 generated samples
    const passwordSet = new Set();
    for (let i = 0; i < 50; i++) {
      passwordSet.add(generateSecurePassword(16));
    }
    assert(passwordSet.size === 50, '50 sequentially generated passwords exhibit zero collisions');

    // 2.4 Bcrypt hash generation and verification
    const testHash = await bcrypt.hash(pwd1, 10);
    const isValidHash = await bcrypt.compare(pwd1, testHash);
    const isInvalidHash = await bcrypt.compare('WrongPassword!123', testHash);
    assert(isValidHash === true, 'Bcrypt successfully verifies generated password against hash');
    assert(isInvalidHash === false, 'Bcrypt rejects incorrect password comparison');

    // =========================================================================
    // 3. Credential Generation, Overwrite Protection & File Permissions (SEC-9D-03)
    // =========================================================================
    const sampleCohort = [
      {
        name: 'Arjun Verma',
        email: 'synth.arjun.v@rgkedia.edu.in',
        role: 'STUDENT',
        rollNumber: '111224000101',
        program: 'BCOM',
        branch: 'General',
        year: 1,
        semester: 1,
        secondLanguage: 'TELUGU',
      },
      {
        name: 'Dr. Sunita Rao',
        email: 'synth.sunita.r@rgkedia.edu.in',
        role: 'TEACHER',
        rollNumber: null,
        program: null,
        branch: 'Commerce',
        year: null,
        semester: null,
        secondLanguage: null,
      },
    ];

    const credFileJson = path.resolve(tempDir, 'cohort-credentials.json');
    createdFilePaths.push(credFileJson);

    // 3.1 Initial generation outside repo
    const genResult = await generateSyntheticCredentials(sampleCohort, {
      outputPath: credFileJson,
      repoRoot,
    });
    assert(fs.existsSync(credFileJson), 'Synthetic credentials file successfully written to disk outside repo');
    assert(genResult.recordCount === 2, 'Generation result reports correct record count');
    assert(genResult.fileSizeBytes > 0, 'Generation result reports positive file size');
    assert(
      genResult.outputPath === credFileJson,
      'Generation result matches target path'
    );

    // 3.2 Zero secret leakage in return object
    assert(
      !('temporaryPassword' in genResult) && !('passwordHash' in genResult) && !('credentials' in genResult),
      'Generation summary result leaks zero plaintext passwords or hashes (DPDP compliant)'
    );

    // 3.3 Verify file contents & warning banner
    const fileRaw = fs.readFileSync(credFileJson, 'utf8');
    const parsedEnvelope = JSON.parse(fileRaw);
    assert(
      parsedEnvelope.warning.includes('CRITICAL') &&
        parsedEnvelope.warning.includes('DO NOT COMMIT TO VERSION CONTROL'),
      'Credential file includes prominent security warning banner'
    );
    assert(parsedEnvelope.recordCount === 2, 'Credential envelope recordCount matches cohort size');
    assert(parsedEnvelope.credentials.length === 2, 'Credential envelope contains generated records');
    assert(
      parsedEnvelope.credentials[0].mustChangePassword === true,
      'Generated student credential enforces mustChangePassword: true'
    );
    assert(
      parsedEnvelope.credentials[1].mustChangePassword === true,
      'Generated teacher credential enforces mustChangePassword: true'
    );

    // 3.4 Overwrite protection without flag must fail closed
    let overwriteBlocked = false;
    try {
      await generateSyntheticCredentials(sampleCohort, {
        outputPath: credFileJson,
        overwrite: false,
        repoRoot,
      });
    } catch (err) {
      if (err.message.includes('CREDENTIAL_OUTPUT_EXISTS')) {
        overwriteBlocked = true;
      }
    }
    assert(overwriteBlocked, 'generateSyntheticCredentials blocks overwriting existing file when overwrite is false');

    // 3.5 Overwrite with explicit flag succeeds
    const overwriteResult = await generateSyntheticCredentials(sampleCohort, {
      outputPath: credFileJson,
      overwrite: true,
      repoRoot,
    });
    assert(overwriteResult.recordCount === 2, 'generateSyntheticCredentials succeeds with explicit overwrite: true');

    // 3.6 CSV output format support
    const credFileCsv = path.resolve(tempDir, 'cohort-credentials.csv');
    createdFilePaths.push(credFileCsv);
    const csvResult = await generateSyntheticCredentials(sampleCohort, {
      outputPath: credFileCsv,
      format: 'csv',
      repoRoot,
    });
    assert(fs.existsSync(credFileCsv), 'CSV credentials file successfully generated');
    const csvContent = fs.readFileSync(credFileCsv, 'utf8');
    assert(
      csvContent.startsWith('# WARNING:'),
      'CSV credentials file begins with comment warning banner'
    );
    assert(
      csvContent.includes('synth.arjun.v@rgkedia.edu.in') && csvContent.includes('synth.sunita.r@rgkedia.edu.in'),
      'CSV credentials file contains synthetic user rows'
    );

    // =========================================================================
    // 4. Synthetic User Cohort Validation Engine (VAL-9D-01)
    // =========================================================================
    // 4.1 Valid synthetic cohort passes completely
    const validCohort = generateSyntheticCohort({
      studentCount: 6,
      teacherCount: 2,
      librarianCount: 1,
      tag: 'testval',
    });
    const valResult1 = await validateSyntheticCohort(validCohort);
    assert(valResult1.isValid === true, 'Valid synthetic cohort passes validation with isValid: true');
    assert(valResult1.errors.length === 0, 'Valid synthetic cohort produces 0 errors');
    assert(valResult1.summary.totalRecords === 9, 'Validation summary reports 9 total records');
    assert(valResult1.summary.validRecords === 9, 'Validation summary reports 9 valid records');
    assert(valResult1.summary.invalidRecords === 0, 'Validation summary reports 0 invalid records');
    assert(valResult1.summary.byRole.STUDENT === 6, 'Summary accurately counts 6 students');
    assert(valResult1.summary.byRole.TEACHER === 2, 'Summary accurately counts 2 teachers');
    assert(valResult1.summary.byRole.LIBRARIAN === 1, 'Summary accurately counts 1 librarian');

    // 4.2 Academic consistency matrix checks (Year vs Semester)
    // Year 1 with Sem 3 -> INVALID
    const mismatchCohort1 = [
      {
        name: 'Mismatch Student',
        email: 'mismatch1@rgkedia.edu.in',
        role: 'STUDENT',
        rollNumber: '111224000991',
        program: 'BCOM',
        year: 1,
        semester: 3, // Year 1 only permits Sem 1 or 2
      },
    ];
    const mismatchRes1 = await validateSyntheticCohort(mismatchCohort1);
    assert(mismatchRes1.isValid === false, 'Year 1 with Semester 3 is flagged as invalid');
    assert(
      mismatchRes1.errors.some((e) => e.code === 'ACADEMIC_MISMATCH'),
      'Academic mismatch error code emitted for Year 1 with Semester 3'
    );
    assert(mismatchRes1.summary.academicMismatches === 1, 'Summary reports 1 academic mismatch');

    // Year 2 with Sem 1 -> INVALID
    const mismatchCohort2 = [
      {
        name: 'Mismatch Student 2',
        email: 'mismatch2@rgkedia.edu.in',
        role: 'STUDENT',
        rollNumber: '111224000992',
        program: 'BBA',
        year: 2,
        semester: 1, // Year 2 only permits Sem 3 or 4
      },
    ];
    const mismatchRes2 = await validateSyntheticCohort(mismatchCohort2);
    assert(mismatchRes2.isValid === false, 'Year 2 with Semester 1 is flagged as invalid');
    assert(
      mismatchRes2.errors.some((e) => e.code === 'ACADEMIC_MISMATCH'),
      'Academic mismatch error code emitted for Year 2 with Semester 1'
    );

    // Year 3 with Sem 4 -> INVALID
    const mismatchCohort3 = [
      {
        name: 'Mismatch Student 3',
        email: 'mismatch3@rgkedia.edu.in',
        role: 'STUDENT',
        rollNumber: '111224000993',
        program: 'BSC',
        year: 3,
        semester: 4, // Year 3 only permits Sem 5 or 6
      },
    ];
    const mismatchRes3 = await validateSyntheticCohort(mismatchCohort3);
    assert(mismatchRes3.isValid === false, 'Year 3 with Semester 4 is flagged as invalid');

    // 4.3 Student Roll Number validation & role restrictions
    const invalidStudentCohort = [
      {
        name: 'Bad Roll Student',
        email: 'badroll@rgkedia.edu.in',
        role: 'STUDENT',
        rollNumber: '123', // Too short
        program: 'BCOM',
        year: 1,
        semester: 1,
      },
      {
        name: 'Bad Prog Student',
        email: 'badprog@rgkedia.edu.in',
        role: 'STUDENT',
        rollNumber: '111224000888',
        program: 'UNKNOWN_DEGREE', // Invalid program
        year: 1,
        semester: 1,
      },
    ];
    const invRes = await validateSyntheticCohort(invalidStudentCohort);
    assert(
      invRes.errors.some((e) => e.code === 'INVALID_ROLL_NUMBER_FORMAT'),
      'Short roll number is flagged with INVALID_ROLL_NUMBER_FORMAT'
    );
    assert(
      invRes.errors.some((e) => e.code === 'INVALID_PROGRAM'),
      'Invalid degree program is flagged with INVALID_PROGRAM'
    );

    // 4.4 Non-student role constraints (Teachers & Librarians cannot have student roll numbers)
    const roleMismatchCohort = [
      {
        name: 'Teacher With Roll',
        email: 'teacher.roll@rgkedia.edu.in',
        role: 'TEACHER',
        rollNumber: '111224000777', // Not allowed for teacher
        year: 1,
        semester: 1,
      },
    ];
    const roleMismatchRes = await validateSyntheticCohort(roleMismatchCohort);
    assert(
      roleMismatchRes.errors.some((e) => e.code === 'ROLE_FIELD_MISMATCH'),
      'Teacher with student rollNumber/year/semester is flagged with ROLE_FIELD_MISMATCH'
    );

    // 4.5 Intra-cohort duplicate email & rollNumber detection
    const dupCohort = [
      {
        name: 'User One',
        email: 'duplicate.user@rgkedia.edu.in',
        role: 'STUDENT',
        rollNumber: '111224000555',
        program: 'BCOM',
        year: 1,
        semester: 1,
      },
      {
        name: 'User Two Duplicate Email',
        email: 'duplicate.user@rgkedia.edu.in', // duplicate email
        role: 'STUDENT',
        rollNumber: '111224000556',
        program: 'BCOM',
        year: 1,
        semester: 1,
      },
      {
        name: 'User Three Duplicate Roll',
        email: 'user3@rgkedia.edu.in',
        role: 'STUDENT',
        rollNumber: '111224000555', // duplicate roll
        program: 'BCOM',
        year: 1,
        semester: 1,
      },
    ];
    const dupRes = await validateSyntheticCohort(dupCohort);
    assert(dupRes.isValid === false, 'Intra-cohort duplicates trigger validation failure');
    assert(
      dupRes.errors.some((e) => e.code === 'DUPLICATE_EMAIL_IN_COHORT'),
      'Flagged duplicate email within cohort'
    );
    assert(
      dupRes.errors.some((e) => e.code === 'DUPLICATE_ROLL_NUMBER_IN_COHORT'),
      'Flagged duplicate roll number within cohort'
    );
    assert(dupRes.summary.duplicateEmails === 1, 'Summary reports 1 duplicate email');
    assert(dupRes.summary.duplicateRollNumbers === 1, 'Summary reports 1 duplicate roll number');

    // =========================================================================
    // 5. Input Format Parsing (JSON and CSV) (VAL-9D-02)
    // =========================================================================
    // 5.1 JSON input parsing
    const jsonInput = JSON.stringify([
      {
        name: 'JSON Student',
        email: 'json.student@rgkedia.edu.in',
        role: 'STUDENT',
        rollNumber: '111224000444',
        program: 'BBA',
        year: 2,
        semester: 4,
      },
    ]);
    const jsonRes = await validateSyntheticCohort(jsonInput);
    assert(jsonRes.isValid === true, 'validateSyntheticCohort successfully parses JSON string');
    assert(jsonRes.validRecords.length === 1, 'Parsed JSON yields 1 valid record');

    // 5.2 CSV input parsing
    const csvInput =
      'Name,Email,Role,RollNumber,Program,Branch,Year,Semester,SecondLanguage\n' +
      'CSV Student,csv.student@rgkedia.edu.in,STUDENT,111224000333,BSC,CompSci,3,6,TELUGU\n';
    const csvRes = await validateSyntheticCohort(csvInput);
    assert(csvRes.isValid === true, 'validateSyntheticCohort successfully parses CSV string');
    assert(csvRes.validRecords.length === 1, 'Parsed CSV yields 1 valid record');
    assert(csvRes.validRecords[0].program === 'BSC', 'CSV parsed record retains correct program');
    assert(csvRes.validRecords[0].semester === 6, 'CSV parsed record retains correct semester');

    // 5.3 Empty and invalid CSV parsing
    const emptyRes = await validateSyntheticCohort('');
    assert(emptyRes.isValid === false, 'Empty input fails validation');
    assert(emptyRes.errors.some((e) => e.code === 'EMPTY_INPUT'), 'Emits EMPTY_INPUT error');

    // =========================================================================
    // 6. Database Collision Verification (Neon Test Database) (VAL-9D-03)
    // =========================================================================
    const existingDbUser = await prisma.user.findFirst({
      where: { role: 'STUDENT', rollNumber: { not: null } },
      select: { email: true, rollNumber: true },
    });

    if (existingDbUser && existingDbUser.rollNumber) {
      const collidingCohort = [
        {
          name: 'Colliding Student',
          email: existingDbUser.email,
          role: 'STUDENT',
          rollNumber: existingDbUser.rollNumber,
          program: 'BCOM',
          year: 1,
          semester: 1,
        },
      ];
      const dbCheckRes = await validateSyntheticCohort(collidingCohort, {
        checkDatabase: true,
        prisma,
      });
      assert(dbCheckRes.isValid === false, 'Database conflict check fails when email/roll exists');
      assert(
        dbCheckRes.errors.some((e) => e.code === 'DATABASE_EMAIL_CONFLICT'),
        'Emits DATABASE_EMAIL_CONFLICT for existing user email'
      );
      assert(
        dbCheckRes.errors.some((e) => e.code === 'DATABASE_ROLL_NUMBER_CONFLICT'),
        'Emits DATABASE_ROLL_NUMBER_CONFLICT for existing student roll number'
      );
      assert(dbCheckRes.summary.dbConflicts >= 1, 'Summary reports database conflict count');
    }

    // =========================================================================
    // 7. End-to-End Synthetic Import & Mandatory Password Change Lifecycle Drill
    // =========================================================================
    const drillTag = `p9ddrill_${Date.now()}`;
    const drillRoll = `111224${String(Date.now()).slice(-6)}`;
    const drillEmail = `synth.drill.${drillTag}@rgkedia.edu.in`;

    const drillCohort = [
      {
        name: 'Drill Student',
        email: drillEmail,
        role: 'STUDENT',
        rollNumber: drillRoll,
        program: 'BCOM',
        branch: 'General',
        year: 1,
        semester: 2,
        secondLanguage: 'HINDI',
      },
    ];

    const drillCredPath = path.resolve(tempDir, `drill-credentials-${drillTag}.json`);
    createdFilePaths.push(drillCredPath);

    await generateSyntheticCredentials(drillCohort, {
      outputPath: drillCredPath,
      repoRoot,
    });

    const drillFileRaw = fs.readFileSync(drillCredPath, 'utf8');
    const drillEnvelope = JSON.parse(drillFileRaw);
    const generatedCred = drillEnvelope.credentials[0];

    // Seed to test database
    const seedResult = await seedSyntheticCohortToTestDb(prisma, [generatedCred]);
    assert(seedResult.createdCount === 1, 'Synthetic user successfully seeded into test database');
    createdUserIds.push(...seedResult.userIds);

    // Verify user in DB has mustChangePassword = true
    const seededUser = await prisma.user.findUnique({
      where: { email: drillEmail },
      select: { id: true, mustChangePassword: true, role: true },
    });
    assert(seededUser !== null, 'Seeded synthetic user exists in test database');
    assert(
      seededUser.mustChangePassword === true,
      'Seeded synthetic user in DB has mustChangePassword: true'
    );

    // Attempt login with generated temporary password
    const client = createApiClient(baseUrl);
    const loginRes = await client.login(drillEmail, generatedCred.temporaryPassword);
    assert(loginRes.status === 200, 'Synthetic user login succeeds with temporary password (HTTP 200)');
    assert(
      loginRes.body?.user?.mustChangePassword === true,
      'Login response indicates user.mustChangePassword === true'
    );

    // Verify user can change password to a new secure password
    const newPassword = 'NewSecretPassword!2026';
    const changeRes = await client.request('PUT', '/api/auth/change-password', {
      body: {
        currentPassword: generatedCred.temporaryPassword,
        newPassword,
      },
    });
    assert(changeRes.status === 200, 'Password change succeeds with HTTP 200');

    // Verify mustChangePassword is now false
    const updatedUser = await prisma.user.findUnique({
      where: { id: seededUser.id },
      select: { mustChangePassword: true },
    });
    assert(
      updatedUser.mustChangePassword === false,
      'Synthetic user mustChangePassword is false following successful password change'
    );

    // Clean up seeded user
    const cleanedCount = await cleanupSyntheticCohortFromTestDb(prisma, createdUserIds);
    assert(cleanedCount === 1, 'Synthetic user successfully cleaned up from test database');
    createdUserIds.length = 0; // Clear tracked user IDs

    // =========================================================================
    // 8. DPDP Summary Zero-PII Compliance Assurance
    // =========================================================================
    const fullSyntheticCohort = generateSyntheticCohort({
      studentCount: 20,
      teacherCount: 3,
      librarianCount: 1,
      tag: 'dpdp_check',
    });
    const dpdpVal = await validateSyntheticCohort(fullSyntheticCohort);
    assert(dpdpVal.isValid === true, 'Full synthetic cohort of 24 users is 100% valid');

    const summaryStr = JSON.stringify(dpdpVal.summary);
    assert(
      !summaryStr.includes('@rgkedia.edu.in') &&
        !summaryStr.includes('111224') &&
        !summaryStr.includes('Sharma') &&
        !summaryStr.includes('Dr.'),
      'Cohort summary object contains strictly zero personal identifiers or PII'
    );
  } finally {
    // Clean up temporary database fixtures
    if (createdUserIds.length > 0) {
      try {
        await cleanupSyntheticCohortFromTestDb(prisma, createdUserIds);
      } catch {}
    }
    await prisma.$disconnect();

    // Clean up temporary credential files outside repository
    for (const filePath of createdFilePaths) {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch {}
    }
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {}
  }
}
