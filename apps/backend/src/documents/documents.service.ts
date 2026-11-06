import { Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { config } from '../common/config';
import { hmacSha256, randomToken, safeEqual } from '../common/crypto';
import { AppError, Errors } from '../common/errors';
import { PrismaService } from '../common/prisma.service';

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_BYTES = 8 * 1024 * 1024;

export interface UploadedFileLike { buffer: Buffer; mimetype: string; size: number; originalname?: string }

/**
 * Private document storage. Files are never public: access is through a signed URL that expires in 5 minutes,
 * and every view is logged (DPDP, masterplan §14). Swap the disk backend for S3 with presigned URLs in production.
 */
@Injectable()
export class DocumentsService {
  constructor(private prisma: PrismaService) {}

  async store(file: UploadedFileLike, meta: { ownerType: 'BUSINESS' | 'DRIVER' | 'ORDER'; kind: string; businessId?: string; driverId?: string; orderId?: string }) {
    if (!ALLOWED.includes(file.mimetype)) throw new AppError('INVALID_FILE_TYPE', 'Upload a JPG, PNG, WEBP photo or a PDF', 422);
    if (file.size > MAX_BYTES) throw new AppError('FILE_TOO_LARGE', 'File must be under 8 MB', 422);
    const key = `${meta.ownerType.toLowerCase()}/${randomToken(16)}`;
    const full = path.join(config.uploadDir, key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, file.buffer);
    return this.prisma.document.create({
      data: { ...meta, storageKey: key, mimeType: file.mimetype, sizeBytes: file.size },
    });
  }

  /** Signed, expiring URL. The view is logged at signing time. */
  async signedUrl(documentId: string, viewer: { type: string; id: string }) {
    const doc = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!doc) throw Errors.notFound('Document');
    await this.prisma.documentView.create({ data: { documentId, viewerType: viewer.type, viewerId: viewer.id } });
    const exp = Date.now() + 5 * 60_000;
    const sig = hmacSha256(config.encryptionKey, `${documentId}.${exp}`);
    return { url: `/documents/${documentId}/file?exp=${exp}&sig=${sig}`, expiresAt: new Date(exp) };
  }

  async readSigned(documentId: string, exp: string, sig: string) {
    const expected = hmacSha256(config.encryptionKey, `${documentId}.${exp}`);
    if (!sig || !safeEqual(expected, sig) || Number(exp) < Date.now()) throw new AppError('LINK_EXPIRED', 'Document link expired', 403);
    const doc = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!doc) throw Errors.notFound('Document');
    const buf = await fs.readFile(path.join(config.uploadDir, doc.storageKey));
    return { buf, mimeType: doc.mimeType };
  }
}
