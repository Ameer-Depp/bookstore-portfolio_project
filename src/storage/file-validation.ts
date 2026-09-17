/**
 * Magic-byte detection — we never trust the client-declared MIME type.
 * The `mimetype` field on a multipart upload comes from the client and
 * can be forged trivially. The first few bytes of the file cannot.
 */

export type ImageKind = 'jpeg' | 'png' | 'webp';

export function detectImageKind(buffer: Buffer): ImageKind | null {
  if (buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'png';
  }

  // WebP: 'RIFF' .... 'WEBP'
  if (
    buffer[0] === 0x52 && // R
    buffer[1] === 0x49 && // I
    buffer[2] === 0x46 && // F
    buffer[3] === 0x46 && // F
    buffer[8] === 0x57 && // W
    buffer[9] === 0x45 && // E
    buffer[10] === 0x42 && // B
    buffer[11] === 0x50 // P
  ) {
    return 'webp';
  }

  return null;
}

export function isPdf(buffer: Buffer): boolean {
  if (buffer.length < 5) return false;
  // %PDF-
  return (
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46 &&
    buffer[4] === 0x2d
  );
}

export function contentTypeForImage(kind: ImageKind): string {
  switch (kind) {
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
  }
}

export function extensionForImage(kind: ImageKind): string {
  switch (kind) {
    case 'jpeg':
      return '.jpg';
    case 'png':
      return '.png';
    case 'webp':
      return '.webp';
  }
}
