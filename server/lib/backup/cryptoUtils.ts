// server/lib/backup/cryptoUtils.ts — Cryptographic utilities & secret redaction
import crypto from 'crypto';
import { EncryptedBackupEnvelope } from './types.js';

/**
 * Validates and parses a strict 256-bit symmetric key from a 64-character hexadecimal string.
 *
 * SECURITY REQUIREMENT (SEC-9C-01):
 * To prevent offline brute-force and dictionary attacks on leaked or intercepted backup archives,
 * arbitrary text passphrases are strictly rejected. The encryption key must be a cryptographically
 * random 256-bit key formatted as exactly 64 hexadecimal characters.
 *
 * Key generation example:
 *   Linux / macOS:  openssl rand -hex 32
 *   Node.js CLI:    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */
export function deriveKeyBuffer(keyString: string): Buffer {
  if (!keyString || typeof keyString !== 'string' || !keyString.trim()) {
    throw new Error('INVALID_KEY: Encryption key must be a non-empty string.');
  }

  const trimmed = keyString.trim();

  if (trimmed.length !== 64) {
    throw new Error(
      `INVALID_KEY_LENGTH: BACKUP_ENCRYPTION_KEY must be exactly 64 hexadecimal characters (256 bits). Received ${trimmed.length} characters. Passphrases are rejected to prevent offline brute-force attacks.`
    );
  }

  if (!/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    throw new Error(
      'INVALID_KEY_FORMAT: BACKUP_ENCRYPTION_KEY contains non-hexadecimal characters. Key must be a 64-character hex string representing 32 cryptographically random bytes.'
    );
  }

  return Buffer.from(trimmed, 'hex');
}

/**
 * Calculates SHA-256 checksum of a string or Buffer.
 */
export function calculateChecksum(data: string | Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Encrypts a plaintext string using AES-256-GCM with a random 12-byte IV.
 */
export function encryptPayload(
  plaintext: string,
  keyString: string,
  sourceHost: string = 'redacted'
): EncryptedBackupEnvelope {
  const key = deriveKeyBuffer(keyString);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
  ciphertext += cipher.final('base64');
  const authTag = cipher.getAuthTag();

  return {
    format: 'RG_KEDIA_ENCRYPTED_BACKUP_V1',
    version: '1.0.0',
    algorithm: 'aes-256-gcm',
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    ciphertext,
    checksum: calculateChecksum(plaintext),
    createdAt: new Date().toISOString(),
    sourceHost,
  };
}

/**
 * Decrypts an AES-256-GCM encrypted envelope and verifies its authentication tag.
 */
export function decryptPayload(
  envelope: EncryptedBackupEnvelope,
  keyString: string
): string {
  if (envelope.format !== 'RG_KEDIA_ENCRYPTED_BACKUP_V1') {
    throw new Error(`UNSUPPORTED_FORMAT: Expected "RG_KEDIA_ENCRYPTED_BACKUP_V1", got "${envelope.format}".`);
  }
  if (envelope.algorithm !== 'aes-256-gcm') {
    throw new Error(`UNSUPPORTED_ALGORITHM: Expected "aes-256-gcm", got "${envelope.algorithm}".`);
  }

  const key = deriveKeyBuffer(keyString);
  const iv = Buffer.from(envelope.iv, 'hex');
  const authTag = Buffer.from(envelope.authTag, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  try {
    let decrypted = decipher.update(envelope.ciphertext, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    // Verify plaintext checksum
    const computedChecksum = calculateChecksum(decrypted);
    if (computedChecksum !== envelope.checksum) {
      throw new Error('CHECKSUM_MISMATCH: Decrypted plaintext checksum does not match expected checksum.');
    }

    return decrypted;
  } catch (err: any) {
    if (err.message?.startsWith('CHECKSUM_MISMATCH')) {
      throw err;
    }
    throw new Error('DECRYPTION_FAILED: Authentication tag verification failed or incorrect encryption key.');
  }
}

/**
 * Redacts database connection strings and credentials from logs and error strings.
 */
export function redactSecrets(input: string): string {
  if (!input || typeof input !== 'string') return '';
  return input
    .replace(/(postgres(?:ql)?:\/\/[^:]+:)([^@]+)(@)/gi, '$1***$3')
    .replace(/(password|token|key|secret)=([^\s&]+)/gi, '$1=***');
}

/**
 * Extracts a safe hostname representation without exposing passwords or query tokens.
 */
export function getSafeHostString(dbUrl?: string): string {
  if (!dbUrl) return 'unknown-host';
  try {
    const parsed = new URL(dbUrl.replace('prisma://', 'postgres://'));
    return parsed.hostname || 'unknown-host';
  } catch {
    return 'unparseable-host';
  }
}
