// tests/suites/librarianBootstrap.test.js — Final Readiness Task 1 Initial Librarian Bootstrap Suite
import bcrypt from 'bcryptjs';
import {
  bootstrapInitialLibrarian,
  validateBootstrapConfig,
} from '../../dist/server/lib/bootstrap/bootstrapAdmin.js';
import { TestDataManager } from '../helpers/testData.js';

export async function runLibrarianBootstrapTests(baseUrl, assert) {
  const dataManager = new TestDataManager();
  const realPrisma = dataManager.prisma;

  try {
    // =========================================================================
    // 1. INPUT VALIDATION TESTS (Environment & Argument Rules)
    // =========================================================================

    // 1.1 Missing INITIAL_LIBRARIAN_EMAIL
    {
      const res = validateBootstrapConfig({
        INITIAL_LIBRARIAN_PASSWORD: 'ValidPassword123!',
      });
      assert(res.valid === false, 'Validation fails when INITIAL_LIBRARIAN_EMAIL is missing');
      assert(
        res.error.includes('INITIAL_LIBRARIAN_EMAIL environment variable is missing'),
        'Reports accurate error when INITIAL_LIBRARIAN_EMAIL is missing'
      );
    }

    // 1.2 Empty or whitespace-only INITIAL_LIBRARIAN_EMAIL
    {
      const res = validateBootstrapConfig({
        INITIAL_LIBRARIAN_EMAIL: '   ',
        INITIAL_LIBRARIAN_PASSWORD: 'ValidPassword123!',
      });
      assert(res.valid === false, 'Validation fails when INITIAL_LIBRARIAN_EMAIL is whitespace');
      assert(
        res.error.includes('INITIAL_LIBRARIAN_EMAIL environment variable is missing or empty'),
        'Reports accurate error for whitespace email'
      );
    }

    // 1.3 Invalid email formats
    const invalidEmails = [
      'notanemail',
      '@domain.com',
      'user@',
      'user@domain',
      'user domain@test.com',
    ];
    for (const invalid of invalidEmails) {
      const res = validateBootstrapConfig({
        INITIAL_LIBRARIAN_EMAIL: invalid,
        INITIAL_LIBRARIAN_PASSWORD: 'ValidPassword123!',
      });
      assert(
        res.valid === false,
        `Validation fails for invalid email format: "${invalid}"`
      );
      assert(
        res.error.includes('not a valid email address format'),
        `Error identifies invalid email format for "${invalid}"`
      );
    }

    // 1.4 Missing INITIAL_LIBRARIAN_PASSWORD
    {
      const res = validateBootstrapConfig({
        INITIAL_LIBRARIAN_EMAIL: 'librarian@rgkedia.edu.in',
      });
      assert(res.valid === false, 'Validation fails when INITIAL_LIBRARIAN_PASSWORD is missing');
      assert(
        res.error.includes('INITIAL_LIBRARIAN_PASSWORD environment variable is missing'),
        'Reports accurate error when INITIAL_LIBRARIAN_PASSWORD is missing'
      );
    }

    // 1.5 Password shorter than 12 characters
    const shortPasswords = ['short', 'Pass12345!', '11chars_pwd', 'Abcdefghijk'];
    for (const shortPwd of shortPasswords) {
      const res = validateBootstrapConfig({
        INITIAL_LIBRARIAN_EMAIL: 'librarian@rgkedia.edu.in',
        INITIAL_LIBRARIAN_PASSWORD: shortPwd,
      });
      assert(
        res.valid === false,
        `Validation fails for password shorter than 12 chars: length ${shortPwd.length}`
      );
      assert(
        res.error.includes('must be at least 12 characters'),
        `Error identifies password length requirement for length ${shortPwd.length}`
      );
      assert(
        !res.error.includes(shortPwd),
        'Error message never leaks the actual password string'
      );
    }

    // 1.6 Valid configuration with email normalization and default name
    {
      const res = validateBootstrapConfig({
        INITIAL_LIBRARIAN_EMAIL: '  Chief.Librarian@RGKEDIA.edu.in  ',
        INITIAL_LIBRARIAN_PASSWORD: 'SecureMasterPassword2026!',
      });
      assert(res.valid === true, 'Validation passes for valid credentials');
      assert(
        res.config.email === 'chief.librarian@rgkedia.edu.in',
        'Normalizes email to lowercase and trims whitespace'
      );
      assert(
        res.config.name === 'Chief Librarian',
        'Defaults name to "Chief Librarian" when not specified'
      );
      assert(
        res.config.password === 'SecureMasterPassword2026!',
        'Preserves password in config for hashing'
      );
    }

    // 1.7 Valid configuration with custom name and phone
    {
      const res = validateBootstrapConfig({
        INITIAL_LIBRARIAN_EMAIL: 'head.librarian@rgkedia.edu.in',
        INITIAL_LIBRARIAN_PASSWORD: 'SecureMasterPassword2026!',
        INITIAL_LIBRARIAN_NAME: 'Dr. K. Srinivas',
        INITIAL_LIBRARIAN_PHONE: '9876543210',
      });
      assert(res.valid === true, 'Validation passes with custom name and phone');
      assert(res.config.name === 'Dr. K. Srinivas', 'Preserves custom librarian name');
      assert(res.config.phone === '9876543210', 'Preserves custom librarian phone');
    }

    // =========================================================================
    // 2. PRODUCTION CONFIRMATION SAFEGUARDS (NODE_ENV=production)
    // =========================================================================

    // 2.1 Production execution without --confirm is blocked
    {
      const res = await bootstrapInitialLibrarian({
        env: {
          NODE_ENV: 'production',
          INITIAL_LIBRARIAN_EMAIL: 'librarian@rgkedia.edu.in',
          INITIAL_LIBRARIAN_PASSWORD: 'SecureMasterPassword2026!',
        },
        confirmProduction: false,
      });

      assert(res.success === false, 'Production execution is blocked without confirmation flag');
      assert(res.status === 'VALIDATION_ERROR', 'Reports status VALIDATION_ERROR');
      assert(
        res.message.includes('BOOTSTRAP_CONFIRMATION_REQUIRED'),
        'Message explicitly cites BOOTSTRAP_CONFIRMATION_REQUIRED'
      );
    }

    // 2.2 Production execution with confirmProduction=true is permitted
    {
      const mockPrisma = {
        $transaction: async (fn) =>
          fn({
            $executeRaw: async () => {},
            user: { findFirst: async () => null, findUnique: async () => null, create: async ({ data }) => ({ ...data, id: 'u1', createdAt: new Date() }) },
            auditLog: { create: async () => ({ id: 'a1' }) },
          }),
        $disconnect: async () => {},
      };

      const res = await bootstrapInitialLibrarian({
        env: {
          NODE_ENV: 'production',
          INITIAL_LIBRARIAN_EMAIL: 'librarian@rgkedia.edu.in',
          INITIAL_LIBRARIAN_PASSWORD: 'SecureMasterPassword2026!',
        },
        prisma: mockPrisma,
        confirmProduction: true,
      });

      assert(res.success === true, 'Production execution succeeds when confirmed');
      assert(res.status === 'SUCCESS', 'Reports SUCCESS when confirmed in production');
    }

    // 2.3 Dry-run mode does NOT require confirmation even in production
    {
      const mockPrisma = {
        $transaction: async (fn) =>
          fn({
            user: { findFirst: async () => null, findUnique: async () => null },
          }),
        $disconnect: async () => {},
      };

      const res = await bootstrapInitialLibrarian({
        env: {
          NODE_ENV: 'production',
          INITIAL_LIBRARIAN_EMAIL: 'librarian@rgkedia.edu.in',
          INITIAL_LIBRARIAN_PASSWORD: 'SecureMasterPassword2026!',
        },
        prisma: mockPrisma,
        dryRun: true,
        confirmProduction: false,
      });

      assert(res.success === true, 'Dry-run succeeds in production without --confirm flag');
      assert(res.dryRun === true, 'Explicitly flags dryRun: true');
    }

    // =========================================================================
    // 3. MOCK LIFECYCLE, ATOMICITY & CONCURRENCY TESTS
    // =========================================================================

    // 3.1 Successful first librarian creation with atomic transaction
    {
      let createdData = null;
      let auditLogCreated = false;
      let disconnectCalled = false;
      const mockTx = {
        $executeRaw: async () => {},
        user: {
          findFirst: async () => null,
          findUnique: async () => null,
          create: async ({ data }) => {
            createdData = data;
            return {
              id: 'mock-uuid-librarian-1',
              name: data.name,
              email: data.email,
              role: data.role,
              active: data.active,
              mustChangePassword: data.mustChangePassword,
              createdAt: new Date(),
            };
          },
        },
        auditLog: {
          create: async () => {
            auditLogCreated = true;
            return { id: 'mock-audit-1' };
          },
        },
      };

      const mockPrisma = {
        $transaction: async (fn) => fn(mockTx),
        $disconnect: async () => {
          disconnectCalled = true;
        },
      };

      const result = await bootstrapInitialLibrarian({
        env: {
          INITIAL_LIBRARIAN_EMAIL: 'head.librarian@rgkedia.edu.in',
          INITIAL_LIBRARIAN_PASSWORD: 'MasterAdminPassword2026!',
        },
        prisma: mockPrisma,
        disconnectPrisma: true,
      });

      assert(result.success === true, 'Bootstrap succeeds when no librarian exists');
      assert(result.status === 'SUCCESS', 'Reports status SUCCESS');
      assert(result.user?.role === 'LIBRARIAN', 'Created user has role: LIBRARIAN');
      assert(result.user?.active === true, 'Created user has active: true');
      assert(result.user?.mustChangePassword === true, 'Created user has mustChangePassword: true');
      assert(auditLogCreated === true, 'Audit log was created atomically with user');
      assert(disconnectCalled === true, 'Prisma $disconnect is called on success');

      // Verify password hashing behavior
      assert(createdData !== null, 'User creation was executed in database');
      assert(
        createdData.password !== 'MasterAdminPassword2026!',
        'Password is never stored as plaintext in database'
      );
      assert(
        createdData.password.startsWith('$2'),
        'Password is encrypted using bcrypt hash format'
      );
      const isMatch = await bcrypt.compare('MasterAdminPassword2026!', createdData.password);
      assert(isMatch === true, 'Bcrypt hash correctly verifies against plain password');
    }

    // 3.2 Atomic Rollback: Audit record failure rolls back account creation
    {
      let userCreatedInTx = false;
      let disconnectCalled = false;
      const mockTx = {
        $executeRaw: async () => {},
        user: {
          findFirst: async () => null,
          findUnique: async () => null,
          create: async () => {
            userCreatedInTx = true;
            return { id: 'orphan-user-uuid', email: 'orphan@rgkedia.edu.in' };
          },
        },
        auditLog: {
          create: async () => {
            throw new Error('AUDIT_TABLE_FAILURE: Simulated audit logging failure.');
          },
        },
      };

      let transactionRolledBack = false;
      const mockPrisma = {
        $transaction: async (fn) => {
          try {
            return await fn(mockTx);
          } catch (err) {
            transactionRolledBack = true;
            throw err; // In Prisma, an error inside $transaction triggers full rollback
          }
        },
        $disconnect: async () => {
          disconnectCalled = true;
        },
      };

      const result = await bootstrapInitialLibrarian({
        env: {
          INITIAL_LIBRARIAN_EMAIL: 'rollback.librarian@rgkedia.edu.in',
          INITIAL_LIBRARIAN_PASSWORD: 'MasterAdminPassword2026!',
        },
        prisma: mockPrisma,
        disconnectPrisma: true,
      });

      assert(result.success === false, 'Bootstrap fails when audit log creation fails');
      assert(result.status === 'DATABASE_ERROR', 'Reports status DATABASE_ERROR on audit failure');
      assert(
        transactionRolledBack === true,
        'Prisma transaction is rolled back when audit creation throws'
      );
      assert(disconnectCalled === true, 'Prisma $disconnect is called upon rollback');
    }

    // 3.3 Concurrency Protection: Two concurrent executions with DIFFERENT emails
    {
      let librariansInDb = [];
      let lockAcquired = false;

      // Mock database state shared between concurrent callers
      const makeMockClient = () => ({
        $transaction: async (fn) => {
          // Advisory lock serializes access to the transaction
          while (lockAcquired) {
            await new Promise((r) => setTimeout(r, 10));
          }
          lockAcquired = true;
          try {
            return await fn({
              $executeRaw: async () => {},
              user: {
                findFirst: async ({ where }) => {
                  return librariansInDb.find((u) => u.role === where.role) || null;
                },
                findUnique: async ({ where }) => {
                  return librariansInDb.find((u) => u.email === where.email) || null;
                },
                create: async ({ data }) => {
                  const newUser = { ...data, id: `lib-${librariansInDb.length + 1}`, createdAt: new Date() };
                  librariansInDb.push(newUser);
                  return newUser;
                },
              },
              auditLog: { create: async () => ({ id: 'a1' }) },
            });
          } finally {
            lockAcquired = false;
          }
        },
        $disconnect: async () => {},
      });

      const clientA = makeMockClient();
      const clientB = makeMockClient();

      // Launch both executions simultaneously with DIFFERENT emails
      const [resA, resB] = await Promise.all([
        bootstrapInitialLibrarian({
          env: {
            INITIAL_LIBRARIAN_EMAIL: 'librarian_alpha@rgkedia.edu.in',
            INITIAL_LIBRARIAN_PASSWORD: 'MasterAdminPassword2026!',
          },
          prisma: clientA,
        }),
        bootstrapInitialLibrarian({
          env: {
            INITIAL_LIBRARIAN_EMAIL: 'librarian_beta@rgkedia.edu.in',
            INITIAL_LIBRARIAN_PASSWORD: 'MasterAdminPassword2026!',
          },
          prisma: clientB,
        }),
      ]);

      // Exactly ONE must succeed with SUCCESS, and the other must exit with ALREADY_INITIALIZED
      const successCount = [resA, resB].filter((r) => r.status === 'SUCCESS').length;
      const alreadyInitCount = [resA, resB].filter((r) => r.status === 'ALREADY_INITIALIZED').length;

      assert(
        successCount === 1,
        'Concurrency serialization ensures exactly ONE librarian is created'
      );
      assert(
        alreadyInitCount === 1,
        'Second concurrent execution safely exits with ALREADY_INITIALIZED'
      );
      assert(
        librariansInDb.length === 1,
        'Database contains exactly ONE librarian record after concurrent race'
      );
    }

    // 3.4 Dry-run mode does not execute database writes
    {
      let createCalled = false;
      let disconnectCalled = false;
      const mockPrisma = {
        $transaction: async (fn) =>
          fn({
            user: {
              findFirst: async () => null,
              findUnique: async () => null,
              create: async () => {
                createCalled = true;
                return {};
              },
            },
          }),
        $disconnect: async () => {
          disconnectCalled = true;
        },
      };

      const result = await bootstrapInitialLibrarian({
        env: {
          INITIAL_LIBRARIAN_EMAIL: 'dryrun.librarian@rgkedia.edu.in',
          INITIAL_LIBRARIAN_PASSWORD: 'MasterAdminPassword2026!',
        },
        prisma: mockPrisma,
        dryRun: true,
        disconnectPrisma: true,
      });

      assert(result.success === true, 'Dry-run reports success');
      assert(result.dryRun === true, 'Result explicitly flags dryRun: true');
      assert(createCalled === false, 'Zero database insert operations occur in dry-run mode');
      assert(disconnectCalled === true, 'Prisma $disconnect is called in dry-run mode');
    }

    // 3.5 Existing librarian guard: exits with ALREADY_INITIALIZED, zero writes
    {
      let createCalled = false;
      let disconnectCalled = false;
      const mockPrisma = {
        $transaction: async (fn) =>
          fn({
            user: {
              findFirst: async ({ where }) => {
                if (where.role === 'LIBRARIAN') {
                  return {
                    id: 'existing-lib-uuid',
                    email: 'existing.librarian@rgkedia.edu.in',
                  };
                }
                return null;
              },
              findUnique: async () => null,
              create: async () => {
                createCalled = true;
                return {};
              },
            },
          }),
        $disconnect: async () => {
          disconnectCalled = true;
        },
      };

      const result = await bootstrapInitialLibrarian({
        env: {
          INITIAL_LIBRARIAN_EMAIL: 'new.librarian@rgkedia.edu.in',
          INITIAL_LIBRARIAN_PASSWORD: 'MasterAdminPassword2026!',
        },
        prisma: mockPrisma,
        disconnectPrisma: true,
      });

      assert(result.success === true, 'Returns successful exit when librarian already exists');
      assert(
        result.status === 'ALREADY_INITIALIZED',
        'Reports status ALREADY_INITIALIZED when librarian is present'
      );
      assert(createCalled === false, 'Zero database insert operations occur when librarian exists');
      assert(
        result.message.includes('Zero records were modified'),
        'Message explicitly confirms zero records were modified'
      );
      assert(disconnectCalled === true, 'Prisma $disconnect is called on ALREADY_INITIALIZED');
    }

    // 3.6 Duplicate email guard: exits with EMAIL_ALREADY_EXISTS, zero writes
    {
      let createCalled = false;
      let disconnectCalled = false;
      const mockPrisma = {
        $transaction: async (fn) =>
          fn({
            user: {
              findFirst: async () => null,
              findUnique: async ({ where }) => {
                if (where.email === 'student1@rgkedia.edu.in') {
                  return {
                    id: 'existing-student-uuid',
                    email: 'student1@rgkedia.edu.in',
                    role: 'STUDENT',
                  };
                }
                return null;
              },
              create: async () => {
                createCalled = true;
                return {};
              },
            },
          }),
        $disconnect: async () => {
          disconnectCalled = true;
        },
      };

      const result = await bootstrapInitialLibrarian({
        env: {
          INITIAL_LIBRARIAN_EMAIL: 'student1@rgkedia.edu.in',
          INITIAL_LIBRARIAN_PASSWORD: 'MasterAdminPassword2026!',
        },
        prisma: mockPrisma,
        disconnectPrisma: true,
      });

      assert(result.success === false, 'Returns failure when email belongs to existing user');
      assert(
        result.status === 'EMAIL_ALREADY_EXISTS',
        'Reports status EMAIL_ALREADY_EXISTS on duplicate email'
      );
      assert(createCalled === false, 'Zero records created on duplicate email conflict');
      assert(
        result.message.includes('already exists with role "STUDENT"'),
        'Message clearly identifies conflicting user role'
      );
      assert(disconnectCalled === true, 'Prisma $disconnect is called on duplicate email');
    }

    // 3.7 Database error handling & secret redaction
    {
      let disconnectCalled = false;
      const mockPrisma = {
        $transaction: async () => {
          throw new Error(
            'Connection failed to postgres://user:secret_password@db.example.internal:5432/library'
          );
        },
        $disconnect: async () => {
          disconnectCalled = true;
        },
      };

      const result = await bootstrapInitialLibrarian({
        env: {
          INITIAL_LIBRARIAN_EMAIL: 'librarian@rgkedia.edu.in',
          INITIAL_LIBRARIAN_PASSWORD: 'MasterAdminPassword2026!',
        },
        prisma: mockPrisma,
        disconnectPrisma: true,
      });

      assert(result.success === false, 'Returns failure on database error');
      assert(result.status === 'DATABASE_ERROR', 'Reports status DATABASE_ERROR');
      assert(
        !result.message.includes('secret_password'),
        'Database error message strictly redacts connection credentials'
      );
      assert(
        result.message.includes('<credentials-redacted>'),
        'Database error message replaces credentials with redaction token'
      );
      assert(
        disconnectCalled === true,
        'Prisma $disconnect is guaranteed to be called in finally block on error'
      );
    }

    // =========================================================================
    // 4. INTEGRATION TESTS (Approved Test Database)
    // =========================================================================

    // 4.1 Existing librarian check against real test database
    {
      const realResult = await bootstrapInitialLibrarian({
        env: {
          INITIAL_LIBRARIAN_EMAIL: 'chief.librarian.test@rgkedia.edu.in',
          INITIAL_LIBRARIAN_PASSWORD: 'MasterAdminPassword2026!',
        },
        prisma: realPrisma,
        disconnectPrisma: false,
      });

      assert(realResult.success === true, 'Real database invocation succeeds safely');
      assert(
        realResult.status === 'ALREADY_INITIALIZED',
        'Real test database identifies pre-existing librarian and reports ALREADY_INITIALIZED'
      );
      assert(
        realResult.existingLibrarian !== undefined,
        'Reports existing librarian metadata from real database'
      );

      // Verify that no new user was created with the candidate email
      const candidateUser = await realPrisma.user.findUnique({
        where: { email: 'chief.librarian.test@rgkedia.edu.in' },
      });
      assert(
        candidateUser === null,
        'Confirms ZERO rows were inserted into the test database'
      );
    }

    // 4.2 Duplicate email check against real test database with existing non-librarian user
    {
      const testStudent = await dataManager.createStudent({ tag: 'boot_dup' });

      const realResult = await bootstrapInitialLibrarian({
        env: {
          INITIAL_LIBRARIAN_EMAIL: testStudent.email,
          INITIAL_LIBRARIAN_PASSWORD: 'MasterAdminPassword2026!',
        },
        prisma: realPrisma,
        disconnectPrisma: false,
      });

      assert(
        realResult.status === 'ALREADY_INITIALIZED' || realResult.status === 'EMAIL_ALREADY_EXISTS',
        'Real database safely short-circuits on existing records without mutating'
      );
    }
  } finally {
    await dataManager.cleanup();
  }
}
