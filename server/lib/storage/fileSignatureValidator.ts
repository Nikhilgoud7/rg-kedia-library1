// server/lib/storage/fileSignatureValidator.ts — Exam Paper File Magic-Byte & Signature Validator
import path from 'path';

export interface FileValidationResult {
  valid: boolean;
  detectedMime: string | null;
  detectedExt: string | null;
  error?: string;
}

interface MagicSignature {
  ext: string;
  mime: string;
  matcher: (buffer: Buffer) => boolean;
}

/**
 * Known binary signatures for approved examination paper and academic material formats:
 * - PDF: 25 50 44 46 (%PDF)
 * - PNG: 89 50 4E 47 0D 0A 1A 0A
 * - JPEG: FF D8 FF
 * - DOC (CFBF / OLE2): D0 CF 11 E0 A1 B1 1A E1
 * - DOCX (ZIP / OpenXML): 50 4B 03 04 (PK..)
 */
const SIGNATURES: MagicSignature[] = [
  {
    ext: '.pdf',
    mime: 'application/pdf',
    matcher: (buf: Buffer) =>
      buf.length >= 4 &&
      buf[0] === 0x25 &&
      buf[1] === 0x50 &&
      buf[2] === 0x44 &&
      buf[3] === 0x46, // %PDF
  },
  {
    ext: '.png',
    mime: 'image/png',
    matcher: (buf: Buffer) =>
      buf.length >= 8 &&
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47 &&
      buf[4] === 0x0d &&
      buf[5] === 0x0a &&
      buf[6] === 0x1a &&
      buf[7] === 0x0a,
  },
  {
    ext: '.jpg',
    mime: 'image/jpeg',
    matcher: (buf: Buffer) =>
      buf.length >= 3 &&
      buf[0] === 0xff &&
      buf[1] === 0xd8 &&
      buf[2] === 0xff,
  },
  {
    ext: '.jpeg',
    mime: 'image/jpeg',
    matcher: (buf: Buffer) =>
      buf.length >= 3 &&
      buf[0] === 0xff &&
      buf[1] === 0xd8 &&
      buf[2] === 0xff,
  },
  {
    ext: '.doc',
    mime: 'application/msword',
    matcher: (buf: Buffer) =>
      buf.length >= 8 &&
      buf[0] === 0xd0 &&
      buf[1] === 0xcf &&
      buf[2] === 0x11 &&
      buf[3] === 0xe0 &&
      buf[4] === 0xa1 &&
      buf[5] === 0xb1 &&
      buf[6] === 0x1a &&
      buf[7] === 0xe1,
  },
  {
    ext: '.docx',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    matcher: (buf: Buffer) =>
      buf.length >= 4 &&
      buf[0] === 0x50 &&
      buf[1] === 0x4b &&
      buf[2] === 0x03 &&
      buf[3] === 0x04, // PK..
  },
];

export const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png'];
export const MAX_EXAM_PAPER_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Validates file buffer against extension, size, and binary magic-byte signatures.
 */
export function validateExamPaperFile(
  buffer: Buffer,
  originalFilename: string,
  declaredMime?: string
): FileValidationResult {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    return { valid: false, detectedMime: null, detectedExt: null, error: 'File payload is empty or invalid.' };
  }

  if (buffer.length === 0) {
    return { valid: false, detectedMime: null, detectedExt: null, error: 'File is empty (0 bytes).' };
  }

  if (buffer.length > MAX_EXAM_PAPER_BYTES) {
    return {
      valid: false,
      detectedMime: null,
      detectedExt: null,
      error: `File size (${(buffer.length / (1024 * 1024)).toFixed(2)} MB) exceeds 10MB limit.`,
    };
  }

  const ext = path.extname(originalFilename || '').toLowerCase();
  if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
    return {
      valid: false,
      detectedMime: null,
      detectedExt: null,
      error: 'Only PDF, DOC, DOCX, and image files are allowed.',
    };
  }

  // Disallow executable content signatures explicitly (defense-in-depth)
  if (buffer.length >= 2 && buffer[0] === 0x4d && buffer[1] === 0x5a) {
    // MZ header
    return {
      valid: false,
      detectedMime: null,
      detectedExt: null,
      error: 'Executable file formats are strictly forbidden.',
    };
  }

  // Find matching binary signature
  const matchingSignature = SIGNATURES.find((sig) => sig.matcher(buffer));

  if (!matchingSignature) {
    return {
      valid: false,
      detectedMime: null,
      detectedExt: null,
      error: `Invalid file content. File binary header does not match declared format '${ext}'.`,
    };
  }

  // Check if detected extension matches declared extension
  const matchesDeclaredExt =
    matchingSignature.ext === ext ||
    (matchingSignature.ext === '.jpg' && ext === '.jpeg') ||
    (matchingSignature.ext === '.jpeg' && ext === '.jpg');

  if (!matchesDeclaredExt) {
    return {
      valid: false,
      detectedMime: matchingSignature.mime,
      detectedExt: matchingSignature.ext,
      error: `Extension mismatch: file extension is '${ext}', but content signature is '${matchingSignature.ext}'.`,
    };
  }

  return {
    valid: true,
    detectedMime: matchingSignature.mime,
    detectedExt: matchingSignature.ext,
  };
}
