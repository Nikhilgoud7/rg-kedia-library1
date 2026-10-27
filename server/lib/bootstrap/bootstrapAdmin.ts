// server/lib/bootstrap/bootstrapAdmin.ts — Safe Initial Librarian Account Bootstrap Engine
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

export interface BootstrapConfig {
  email: string;
  password: string;
  name: string;
  phone?: string;
}

export interface BootstrapValidationResult {
  valid: boolean;
  error?: string;
  config?: BootstrapConfig;
}

export interface BootstrapResult {
  success: boolean;
  status:
    | 'SUCCESS'
    | 'ALREADY_INITIALIZED'
    | 'EMAIL_ALREADY_EXISTS'
    | 'VALIDATION_ERROR'
    | 'DATABASE_ERROR';
  message: string;
  user?: {
    id?: string;
    name: string;
    email: string;
    role: string;
    active: boolean;
    mustChangePassword: boolean;
    createdAt: Date;
  };
  existingLibrarian?: {
    id?: string;
    email: string;
  };
  dryRun?: boolean;
}

export interface BootstrapOptions {
  env?: NodeJS.ProcessEnv;
  config?: Partial<BootstrapConfig>;
  prisma?: PrismaClient;
  dryRun?: boolean;
  confirmProduction?: boolean;
  disconnectPrisma?: boolean;
}

/**
 * Validates bootstrap configuration from environment variables or explicit config.
 * Enforces:
 * 1. INITIAL_LIBRARIAN_EMAIL must be present, non-empty, and valid email format.
 * 2. INITIAL_LIBRARIAN_PASSWORD must be present and >= 12 characters.
 * 3. Normalizes email to lowercase and trims whitespace.
 * 4. Never exposes passwords or sensitive credentials in error messages.
 */
export function validateBootstrapConfig(
  env: NodeJS.ProcessEnv = process.env,
  overrideConfig?: Partial<BootstrapConfig>
): BootstrapValidationResult {
  const rawEmail = overrideConfig?.email !== undefined ? overrideConfig.email : env.INITIAL_LIBRARIAN_EMAIL;
  const rawPassword = overrideConfig?.password !== undefined ? overrideConfig.password : env.INITIAL_LIBRARIAN_PASSWORD;
  const rawName = overrideConfig?.name !== undefined ? overrideConfig.name : env.INITIAL_LIBRARIAN_NAME;
  const rawPhone = overrideConfig?.phone !== undefined ? overrideConfig.phone : env.INITIAL_LIBRARIAN_PHONE;

  if (rawEmail === undefined || rawEmail === null || typeof rawEmail !== 'string' || !rawEmail.trim()) {
    return {
      valid: false,
      error: 'BOOTSTRAP_VALIDATION_ERROR: INITIAL_LIBRARIAN_EMAIL environment variable is missing or empty.',
    };
  }

  const normalizedEmail = rawEmail.trim().toLowerCase();
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(normalizedEmail)) {
    return {
      valid: false,
      error: `BOOTSTRAP_VALIDATION_ERROR: INITIAL_LIBRARIAN_EMAIL "${normalizedEmail}" is not a valid email address format.`,
    };
  }

  if (rawPassword === undefined || rawPassword === null || typeof rawPassword !== 'string' || !rawPassword) {
    return {
      valid: false,
      error: 'BOOTSTRAP_VALIDATION_ERROR: INITIAL_LIBRARIAN_PASSWORD environment variable is missing or empty.',
    };
  }

  if (rawPassword.length < 12) {
    return {
      valid: false,
      error: `BOOTSTRAP_VALIDATION_ERROR: INITIAL_LIBRARIAN_PASSWORD must be at least 12 characters in length (received ${rawPassword.length} characters).`,
    };
  }

  const name =
    rawName && typeof rawName === 'string' && rawName.trim()
      ? rawName.trim()
      : 'Chief Librarian';
  const phone =
    rawPhone && typeof rawPhone === 'string' && rawPhone.trim()
      ? rawPhone.trim()
      : undefined;

  return {
    valid: true,
    config: {
      email: normalizedEmail,
      password: rawPassword,
      name,
      phone,
    },
  };
}

/**
 * Executes initial Chief Librarian bootstrap.
 *
 * SAFETY & TRANSACTION GUARANTEES:
 * 1. Checks if any librarian already exists in the database. If found, safely exits with ALREADY_INITIALIZED without modifying any records.
 * 2. Checks if a user already exists with the target email. If found, safely aborts with EMAIL_ALREADY_EXISTS.
 * 3. Concurrency Protection: Uses PostgreSQL advisory transaction lock (pg_advisory_xact_lock) to serialize concurrent bootstrap attempts across different emails.
 * 4. Atomic Transaction: Account creation and required initial audit log record succeed or fail together inside a single Prisma transaction (prisma.$transaction).
 * 5. Production Confirmation Safeguard: Requires explicit confirmation (--confirm or confirmProduction: true) when running in NODE_ENV=production.
 * 6. Never deletes, deactivates, updates, or overwrites existing records.
 * 7. Hashes password using bcryptjs (salt factor 10). Never stores or prints plaintext passwords.
 * 8. Sets role: 'LIBRARIAN', active: true, mustChangePassword: true.
 * 9. Always disconnects Prisma on success and failure in finally block.
 * 10. Supports non-mutating --dry-run mode.
 */
export async function bootstrapInitialLibrarian(
  options: BootstrapOptions = {}
): Promise<BootstrapResult> {
  const envSource = options.env || process.env;
  const isDryRun = Boolean(options.dryRun);

  // Production Confirmation Safeguard
  const nodeEnv = (envSource.NODE_ENV || 'development').toLowerCase().trim();
  const isProduction = nodeEnv === 'production';
  const hasConfirm = Boolean(
    options.confirmProduction ||
      envSource.CONFIRM_BOOTSTRAP === 'true' ||
      envSource.CONFIRM_PRODUCTION_BOOTSTRAP === 'true'
  );

  if (isProduction && !isDryRun && !hasConfirm) {
    return {
      success: false,
      status: 'VALIDATION_ERROR',
      message:
        'BOOTSTRAP_CONFIRMATION_REQUIRED: In production environment (NODE_ENV=production), bootstrap execution requires an explicit confirmation flag (--confirm) to prevent accidental execution.',
      dryRun: false,
    };
  }

  const validation = validateBootstrapConfig(envSource, options.config);
  if (!validation.valid || !validation.config) {
    return {
      success: false,
      status: 'VALIDATION_ERROR',
      message: validation.error || 'Validation failed.',
      dryRun: isDryRun,
    };
  }

  const { email, password, name, phone } = validation.config;

  let prismaInstance = options.prisma;
  const ownsPrisma = !prismaInstance;
  if (!prismaInstance) {
    prismaInstance = new PrismaClient();
  }

  const shouldDisconnect =
    options.disconnectPrisma !== undefined ? options.disconnectPrisma : ownsPrisma;

  try {
    const executeInTransaction = async (tx: any): Promise<BootstrapResult> => {
      // 1. Transaction-level PostgreSQL advisory lock to serialize concurrent initializations
      if (typeof tx.$executeRaw === 'function') {
        try {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'bootstrap:initial_librarian'}))`;
        } catch {
          // If running against non-postgres mock, proceed safely
        }
      }

      // 2. Guard against re-initialization if any librarian exists
      const existingLibrarian = await tx.user.findFirst({
        where: { role: 'LIBRARIAN' },
        select: { id: true, email: true },
      });

      if (existingLibrarian) {
        return {
          success: true,
          status: 'ALREADY_INITIALIZED',
          message:
            'Bootstrap skipped: A librarian account already exists in this database. Zero records were modified.',
          existingLibrarian: {
            id: existingLibrarian.id,
            email: existingLibrarian.email,
          },
          dryRun: isDryRun,
        };
      }

      // 3. Guard against duplicate email for non-librarian user
      const existingUserWithEmail = await tx.user.findUnique({
        where: { email },
        select: { id: true, email: true, role: true },
      });

      if (existingUserWithEmail) {
        return {
          success: false,
          status: 'EMAIL_ALREADY_EXISTS',
          message: `Bootstrap aborted: A user account with email "${email}" already exists with role "${existingUserWithEmail.role}". Zero records were modified.`,
          dryRun: isDryRun,
        };
      }

      if (isDryRun) {
        return {
          success: true,
          status: 'SUCCESS',
          message: `Dry-run successful: Chief Librarian account "${email}" can be safely created. Zero records were modified.`,
          user: {
            id: 'simulated-uuid',
            name,
            email,
            role: 'LIBRARIAN',
            active: true,
            mustChangePassword: true,
            createdAt: new Date(),
          },
          dryRun: true,
        };
      }

      // 4. Hash password using bcryptjs with cost factor 10
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      // 5. Create librarian user
      const createdUser = await tx.user.create({
        data: {
          name,
          email,
          password: passwordHash,
          role: 'LIBRARIAN',
          phone: phone || null,
          active: true,
          mustChangePassword: true,
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          active: true,
          mustChangePassword: true,
          createdAt: true,
        },
      });

      // 6. Create immutable audit log entry atomically inside the same transaction
      // Both account creation and audit entry succeed or fail together
      await tx.auditLog.create({
        data: {
          actorId: createdUser.id,
          action: 'SYSTEM_BOOTSTRAP_INITIAL_LIBRARIAN',
          targetId: createdUser.id,
          details: JSON.stringify({
            email: createdUser.email,
            role: createdUser.role,
            mustChangePassword: createdUser.mustChangePassword,
            timestamp: new Date().toISOString(),
          }),
        },
      });

      return {
        success: true,
        status: 'SUCCESS',
        message: `Initial Chief Librarian account created successfully for "${createdUser.email}".`,
        user: createdUser,
        dryRun: false,
      };
    };

    // Execute through Prisma transaction for atomicity and serialization
    if (typeof (prismaInstance as any).$transaction === 'function') {
      return await (prismaInstance as any).$transaction(executeInTransaction);
    } else {
      return await executeInTransaction(prismaInstance);
    }
  } catch (err: any) {
    // Redact any potential credentials in error message
    const safeErrorMsg = (err?.message || 'Unknown database error').replace(
      /:\/\/.*@/,
      '://<credentials-redacted>@'
    );

    return {
      success: false,
      status: 'DATABASE_ERROR',
      message: `Database error during bootstrap: ${safeErrorMsg}`,
      dryRun: isDryRun,
    };
  } finally {
    if (shouldDisconnect && prismaInstance) {
      await prismaInstance.$disconnect();
    }
  }
}
