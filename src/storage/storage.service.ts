import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import {
  ImageKind,
  contentTypeForImage,
  extensionForImage,
} from './file-validation';

export interface UploadedCover {
  key: string;
  url: string;
}

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly endpointBase: string; // S3 API endpoint — for signed URLs
  private readonly publicBaseUrl: string; // Public URL base — for cover URLs
  private readonly hasPublicUrlOverride: boolean; // ← add this

  constructor(private readonly config: ConfigService) {
    const useSsl = this.config.get<boolean>('S3_USE_SSL') ?? false;
    const protocol = useSsl ? 'https' : 'http';
    const host = this.config.get<string>('S3_ENDPOINT');
    const port = this.config.get<number>('S3_PORT');
    this.endpointBase = `${protocol}://${host}:${port}`;

    // R2 (and some S3 providers) serve public files from a different
    // domain than the S3 API endpoint. If S3_PUBLIC_URL is set, use it
    // for public cover URLs; otherwise fall back to the S3 endpoint
    // (MinIO's behavior).
    const publicUrlOverride = this.config.get<string>('S3_PUBLIC_URL');
    this.hasPublicUrlOverride =
      !!publicUrlOverride && publicUrlOverride.length > 0;
    this.publicBaseUrl = this.hasPublicUrlOverride
      ? publicUrlOverride!.replace(/\/$/, '')
      : this.endpointBase;

    this.bucket = this.config.get<string>('S3_BUCKET')!;

    this.client = new S3Client({
      region: 'us-east-1',
      endpoint: this.endpointBase,
      forcePathStyle: true,
      credentials: {
        accessKeyId: this.config.get<string>('S3_ACCESS_KEY')!,
        secretAccessKey: this.config.get<string>('S3_SECRET_KEY')!,
      },
    });

    this.logger.log(`S3 endpoint: ${this.endpointBase}`);
    this.logger.log(`Public URL base: ${this.publicBaseUrl}`);
  }

  async onModuleInit(): Promise<void> {
    await this.ensureBucketExists();
    // PutBucketPolicy is not supported on Cloudflare R2 — the covers are
    // made publicly readable via the R2.dev subdomain + bucket settings
    // in the Cloudflare dashboard, not via an S3 policy. This call is
    // kept for MinIO compatibility (where it does work).
    await this.ensureCoversArePublicReadable();
  }

  // ---------- Public API ----------

  async uploadCover(buffer: Buffer, kind: ImageKind): Promise<UploadedCover> {
    const key = `covers/${randomUUID()}${extensionForImage(kind)}`;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentTypeForImage(kind),
      }),
    );
    return { key, url: this.publicUrl(key) };
  }

  async uploadPdf(buffer: Buffer): Promise<{ key: string }> {
    const key = `pdfs/${randomUUID()}.pdf`;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: 'application/pdf',
      }),
    );
    return { key };
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  /**
   * Generates a short-lived presigned GET URL for a private object.
   * Anyone holding the URL can fetch the object until it expires.
   * Uses the S3 API endpoint (endpointBase), not the public URL.
   */
  async getSignedDownloadUrl(
    key: string,
    expiresInSeconds: number,
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  /**
   * Public URL for a key.
   *
   * - If S3_PUBLIC_URL is set (R2), the subdomain is bucket-bound, so the
   *   path is just <publicBaseUrl>/<key> — no bucket segment.
   * - Otherwise (MinIO), we use the S3 API endpoint with the bucket in
   *   the path: <endpoint>/<bucket>/<key>.
   */
  publicUrl(key: string): string {
    if (this.hasPublicUrlOverride) {
      return `${this.publicBaseUrl}/${key}`;
    }
    return `${this.endpointBase}/${this.bucket}/${key}`;
  }

  /** Inverse of publicUrl — extract the S3 key from a stored cover URL. */
  keyFromUrl(url: string): string | null {
    if (this.hasPublicUrlOverride) {
      const prefix = `${this.publicBaseUrl}/`;
      if (!url.startsWith(prefix)) return null;
      return url.slice(prefix.length);
    }
    const prefix = `${this.endpointBase}/${this.bucket}/`;
    if (!url.startsWith(prefix)) return null;
    return url.slice(prefix.length);
  }

  // ---------- Bootstrap helpers ----------

  private async ensureBucketExists(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`Bucket "${this.bucket}" already exists`);
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`Created bucket "${this.bucket}"`);
    }
  }

  /**
   * MinIO honors PutBucketPolicy; Cloudflare R2 does not implement it
   * (that's why you see `PutBucketPolicy not implemented` on Render's
   * logs). R2 uses the r2.dev subdomain + bucket public-access setting
   * instead, configured in the Cloudflare dashboard.
   *
   * Wrapped in try/catch so this never fails app startup.
   */
  private async ensureCoversArePublicReadable(): Promise<void> {
    try {
      const { PutBucketPolicyCommand } = await import('@aws-sdk/client-s3');
      const policy = {
        Version: '2012-10-17',
        Statement: [
          {
            Sid: 'PublicReadCovers',
            Effect: 'Allow',
            Principal: { AWS: ['*'] },
            Action: ['s3:GetObject'],
            Resource: [`arn:aws:s3:::${this.bucket}/covers/*`],
          },
        ],
      };
      await this.client.send(
        new PutBucketPolicyCommand({
          Bucket: this.bucket,
          Policy: JSON.stringify(policy),
        }),
      );
      this.logger.log('Bucket policy set: covers/* is publicly readable');
    } catch (err) {
      this.logger.warn(
        `Could not set bucket policy (covers served via S3_PUBLIC_URL instead): ${
          (err as Error).message
        }`,
      );
    }
  }
}
