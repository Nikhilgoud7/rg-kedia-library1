// server/lib/cohort/credentialGenerator.ts — Secure Synthetic Credential Generation Engine
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import {
  SyntheticUserRecord,
  GeneratedUserCredential,
  CredentialEnvelope,
  CredentialGenerationOptions,
  CredentialGenerationResult,
} from './types.js';
import { serializeCsv, sanitizeCsvField } from '../bulkImportFormat.js';

const CHAR_UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const CHAR_LOWER = 'abcdefghijklmnopqrstuvwxyz';
const CHAR_DIGITS = '0123456789';
const CHAR_SYMBOLS = '!@#$%^&*()_+-=[]{}|;:,.<>?';
const ALL_CHARS = CHAR_UPPER + CHAR_LOWER + CHAR_DIGITS + CHAR_SYMBOLS;

const WARNING_BANNER =
  'CRITICAL: SYNTHETIC TEST CREDENTIALS ONLY. DO NOT COMMIT TO VERSION CONTROL OR DEPLOY TO PRODUCTION.';

/**
 * Validates that the target output path is strictly OUTSIDE the Git repository root.
 * Fails closed if the path resolves inside or equal to the repository directory.
 */
export function validateCredentialOutputPath(outputPath: string, repoRoot = process.cwd()): string {
  if (!outputPath || typeof outputPath !== 'string') {
    throw new Error('INVALID_PATH: Output path must be a non-empty string.');
  }

  const resolvedTarget = path.resolve(outputPath);
  const resolvedRepo = path.resolve(repoRoot);

  const relative = path.relative(resolvedRepo, resolvedTarget);

  // If the relative path does not start with '..' and is not absolute, it is inside or equal to repo root.
  const isInsideOrEqual = !relative.startsWith('..') && !path.isAbsolute(relative);

  if (isInsideOrEqual) {
    throw new Error(
      `CREDENTIAL_OUTPUT_INSIDE_REPO_FORBIDDEN: Credential output path (${resolvedTarget}) must be outside the repository root (${resolvedRepo}).`
    );
  }

  return resolvedTarget;
}

/**
 * Verifies that a generated password satisfies minimum length, character classes, and bcrypt byte limits.
 */
export function verifyPasswordStrength(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!password || password.length < 12) {
    errors.push('Password must be at least 12 characters in length.');
  }

  const byteLength = Buffer.byteLength(password, 'utf8');
  if (byteLength > 72) {
    errors.push('Password exceeds bcrypt 72-byte truncation limit.');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter.');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter.');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one digit.');
  }
  if (!/[!@#$%^&*()_+\-=[\]{}|;:,.<>?]/.test(password)) {
    errors.push('Password must contain at least one symbol.');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Generates a high-entropy, cryptographically secure temporary password.
 * Guarantees inclusion of uppercase, lowercase, digits, and symbols.
 * Stays strictly within 72 bytes for safe bcrypt hashing.
 */
export function generateSecurePassword(length = 16): string {
  const targetLength = Math.max(12, Math.min(length, 64));

  while (true) {
    const chars: string[] = [];

    // Ensure at least one from each required character set
    chars.push(CHAR_UPPER[crypto.randomInt(0, CHAR_UPPER.length)]);
    chars.push(CHAR_LOWER[crypto.randomInt(0, CHAR_LOWER.length)]);
    chars.push(CHAR_DIGITS[crypto.randomInt(0, CHAR_DIGITS.length)]);
    chars.push(CHAR_SYMBOLS[crypto.randomInt(0, CHAR_SYMBOLS.length)]);

    // Fill remaining positions with cryptographically uniform random choices
    for (let i = 4; i < targetLength; i++) {
      const idx = crypto.randomInt(0, ALL_CHARS.length);
      chars.push(ALL_CHARS[idx]);
    }

    // Modern Fisher-Yates shuffle with crypto.randomInt
    for (let i = chars.length - 1; i > 0; i--) {
      const j = crypto.randomInt(0, i + 1);
      const temp = chars[i];
      chars[i] = chars[j];
      chars[j] = temp;
    }

    const candidate = chars.join('');
    if (verifyPasswordStrength(candidate).valid) {
      return candidate;
    }
  }
}

/**
 * Generates credentials for a cohort of synthetic user records and writes them strictly
 * outside the Git repository. Returns an audit summary without leaking any credentials or hashes.
 */
export async function generateSyntheticCredentials(
  users: SyntheticUserRecord[],
  options: CredentialGenerationOptions
): Promise<CredentialGenerationResult> {
  const startTime = Date.now();

  if (!Array.isArray(users) || users.length === 0) {
    throw new Error('INVALID_COHORT: User cohort must contain at least one record.');
  }

  const resolvedOutput = validateCredentialOutputPath(options.outputPath, options.repoRoot);

  if (fs.existsSync(resolvedOutput) && options.overwrite !== true) {
    throw new Error('CREDENTIAL_OUTPUT_EXISTS: Output file already exists. Pass overwrite: true to replace.');
  }

  // Ensure output directory exists
  const outputDir = path.dirname(resolvedOutput);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const saltRounds = options.bcryptSaltRounds || 10;
  const passLength = options.passwordLength || 16;
  const format = options.format || (resolvedOutput.endsWith('.csv') ? 'csv' : 'json');

  const credentials: GeneratedUserCredential[] = [];

  for (const user of users) {
    const temporaryPassword = generateSecurePassword(passLength);
    const passwordHash = await bcrypt.hash(temporaryPassword, saltRounds);

    credentials.push({
      name: user.name,
      email: user.email.toLowerCase().trim(),
      role: user.role,
      rollNumber: user.rollNumber || null,
      program: user.program || null,
      branch: user.branch || null,
      year: user.year ?? null,
      semester: user.semester ?? null,
      secondLanguage: user.secondLanguage || null,
      temporaryPassword,
      passwordHash,
      mustChangePassword: true,
    });
  }

  let fileContent: string;

  if (format === 'csv') {
    const headers = [
      'Name',
      'Email',
      'Role',
      'RollNumber',
      'Program',
      'Branch',
      'Year',
      'Semester',
      'SecondLanguage',
      'TemporaryPassword',
      'PasswordHash',
      'MustChangePassword',
    ];

    const dataRows = credentials.map((c) => [
      c.name,
      c.email,
      c.role,
      c.rollNumber || '',
      c.program || '',
      c.branch || '',
      c.year !== null ? String(c.year) : '',
      c.semester !== null ? String(c.semester) : '',
      c.secondLanguage || '',
      c.temporaryPassword,
      c.passwordHash,
      'true',
    ]);

    const csvBody = serializeCsv([headers, ...dataRows], false);
    fileContent = `# WARNING: ${WARNING_BANNER}\r\n${csvBody}`;
  } else {
    const envelope: CredentialEnvelope = {
      warning: WARNING_BANNER,
      generatedAt: new Date().toISOString(),
      recordCount: credentials.length,
      credentials,
    };
    fileContent = JSON.stringify(envelope, null, 2);
  }

  const fileMode = options.fileMode || 0o600;

  fs.writeFileSync(resolvedOutput, fileContent, {
    encoding: 'utf8',
    mode: fileMode,
    flag: 'w',
  });

  // Attempt explicit chmod for Unix platforms (harmless on Windows)
  try {
    fs.chmodSync(resolvedOutput, fileMode);
  } catch {
    // Windows file systems ignore POSIX chmod mode flags
  }

  const stats = fs.statSync(resolvedOutput);

  return {
    outputPath: resolvedOutput,
    recordCount: credentials.length,
    fileSizeBytes: stats.size,
    format,
    durationMs: Date.now() - startTime,
  };
}
