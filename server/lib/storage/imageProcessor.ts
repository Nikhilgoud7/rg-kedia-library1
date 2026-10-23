// server/lib/storage/imageProcessor.ts — In-Memory Cover Image Processing & Validation Engine
import sharp, { Metadata } from 'sharp';

export const MAX_RAW_UPLOAD_SIZE = 5 * 1024 * 1024; // 5 MB
export const MAX_OUTPUT_COVER_SIZE = 50 * 1024; // 50 KB (51,200 bytes)
export const DEFAULT_MAX_WIDTH = 400;
export const DEFAULT_MAX_HEIGHT = 600;
export const MAX_DIMENSION = 8000; // DoS defense against decompression bombs
export const MAX_PIXELS = 25000000; // 25 megapixels

export type SupportedImageFormat = 'jpeg' | 'png' | 'webp';

export interface ProcessedCoverResult {
  buffer: Buffer;
  mimeType: 'image/webp';
  sizeBytes: number;
  width: number;
  height: number;
  format: 'webp';
  originalFormat: SupportedImageFormat;
}

export interface ImageProcessOptions {
  maxWidth?: number;
  maxHeight?: number;
  maxSizeBytes?: number;
}

/**
 * Sniffs raw buffer magic bytes to verify supported image signatures.
 * Rejects SVG, PDF, EXE, HTML, GIF, and arbitrary scripts before decode.
 */
export function detectImageSignature(buffer: Buffer): SupportedImageFormat {
  if (!buffer || buffer.length < 12) {
    throw new Error('CORRUPTED_IMAGE: Buffer is empty or too small to be a valid image.');
  }

  // 1. Explicit dangerous/unsupported format checks
  // PDF: %PDF-
  if (buffer.subarray(0, 5).toString('ascii') === '%PDF-') {
    throw new Error('UNSUPPORTED_IMAGE_FORMAT: PDF files are not accepted as book covers.');
  }

  // EXE: MZ
  if (buffer[0] === 0x4D && buffer[1] === 0x5A) {
    throw new Error('UNSUPPORTED_IMAGE_FORMAT: Executable binary files are strictly rejected.');
  }

  // GIF: GIF87a or GIF89a
  if (buffer.subarray(0, 4).toString('ascii') === 'GIF8') {
    throw new Error('UNSUPPORTED_IMAGE_FORMAT: Animated/GIF images are not accepted as book covers.');
  }

  // HTML / XML / SVG detection
  const startStr = buffer.subarray(0, Math.min(buffer.length, 256)).toString('utf8').trim().toLowerCase();
  if (
    startStr.startsWith('<!doctype') ||
    startStr.startsWith('<html') ||
    startStr.startsWith('<xml') ||
    startStr.startsWith('<?xml') ||
    startStr.startsWith('<svg') ||
    startStr.includes('<svg')
  ) {
    throw new Error('UNSUPPORTED_IMAGE_FORMAT: SVG, HTML, and XML files are strictly rejected.');
  }

  // 2. Positive magic byte verification
  // JPEG: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return 'jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4E &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0D &&
    buffer[5] === 0x0A &&
    buffer[6] === 0x1A &&
    buffer[7] === 0x0A
  ) {
    return 'png';
  }

  // WebP: RIFF ... WEBP
  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp';
  }

  throw new Error('UNSUPPORTED_IMAGE_FORMAT: Only genuine JPEG, PNG, and WebP images are allowed.');
}

/**
 * Validates, decodes, re-orients, scales, and compresses a book cover in memory.
 * Output is guaranteed to be a WebP thumbnail of at most 50 KB (51,200 bytes).
 *
 * Strict Security Guarantees:
 * - Rejects buffers > 5 MB
 * - Validates binary magic bytes (no spoofed MIME types)
 * - Auto-corrects EXIF orientation
 * - Resizes maintaining aspect ratio (fit: inside)
 * - Converts to optimized WebP
 * - Bounded iterative compression ladder enforcing <= 50 KB limit
 * - Zero temporary files written to local disk
 */
export async function processBookCoverImage(
  buffer: Buffer,
  options: ImageProcessOptions = {}
): Promise<ProcessedCoverResult> {
  const maxOutputSize = options.maxSizeBytes || MAX_OUTPUT_COVER_SIZE;
  const maxWidth = options.maxWidth || DEFAULT_MAX_WIDTH;
  const maxHeight = options.maxHeight || DEFAULT_MAX_HEIGHT;

  // 1. Buffer boundary checks
  if (!buffer || buffer.length === 0) {
    throw new Error('EMPTY_BUFFER: Uploaded image buffer cannot be empty.');
  }

  if (buffer.length > MAX_RAW_UPLOAD_SIZE) {
    throw new Error(`FILE_TOO_LARGE: Uploaded file size (${(buffer.length / (1024 * 1024)).toFixed(2)} MB) exceeds maximum allowed limit of 5 MB.`);
  }

  // 2. Binary signature sniffing
  const detectedFormat = detectImageSignature(buffer);

  // 3. Sharp metadata decode & decompression bomb defense
  let metadata: Metadata;
  try {
    metadata = await sharp(buffer, { failOn: 'error' }).metadata();
  } catch (err: any) {
    throw new Error(`CORRUPTED_IMAGE: Image stream is corrupted or cannot be decoded: ${err.message}`);
  }

  if (!metadata.width || !metadata.height) {
    throw new Error('CORRUPTED_IMAGE: Could not determine valid image dimensions.');
  }

  if (metadata.width > MAX_DIMENSION || metadata.height > MAX_DIMENSION) {
    throw new Error(`DIMENSION_EXCEEDED: Image dimensions (${metadata.width}x${metadata.height}) exceed maximum allowed limit of ${MAX_DIMENSION}px.`);
  }

  const totalPixels = metadata.width * metadata.height;
  if (totalPixels > MAX_PIXELS) {
    throw new Error(`PIXEL_LIMIT_EXCEEDED: Total pixel count (${totalPixels}) exceeds safe decoding threshold.`);
  }

  // 4. Bounded iterative compression ladder to guarantee <= 50 KB
  const compressionLadder = [
    { quality: 80, scale: 1.0 },
    { quality: 65, scale: 0.9 },
    { quality: 50, scale: 0.8 },
    { quality: 35, scale: 0.7 },
    { quality: 20, scale: 0.6 },
  ];

  let finalBuffer: Buffer | null = null;
  let finalWidth = 0;
  let finalHeight = 0;

  for (const step of compressionLadder) {
    const targetW = Math.max(100, Math.round(maxWidth * step.scale));
    const targetH = Math.max(150, Math.round(maxHeight * step.scale));

    const pipeline = sharp(buffer)
      .rotate() // Automatic EXIF orientation normalization
      .resize({
        width: targetW,
        height: targetH,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({
        quality: step.quality,
        effort: 6, // High compression effort
        lossless: false,
      });

    const candidate = await pipeline.toBuffer();

    if (candidate.length <= maxOutputSize) {
      finalBuffer = candidate;
      const resultMeta = await sharp(candidate).metadata();
      finalWidth = resultMeta.width || targetW;
      finalHeight = resultMeta.height || targetH;
      break;
    }
  }

  if (!finalBuffer || finalBuffer.length > maxOutputSize) {
    throw new Error(`OUTPUT_SIZE_EXCEEDED: Unable to compress cover image within the required ${Math.round(maxOutputSize / 1024)} KB limit.`);
  }

  return {
    buffer: finalBuffer,
    mimeType: 'image/webp',
    sizeBytes: finalBuffer.length,
    width: finalWidth,
    height: finalHeight,
    format: 'webp',
    originalFormat: detectedFormat,
  };
}
