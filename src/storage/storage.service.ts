import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
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
  private readonly endpointBase: string; // S3 API endpoint (for client)
  private readonly publicBaseUrl: string; // public URL base (for cover URLs)

  constructor(private readonly config: ConfigService) {
    const useSsl = this.config.get<boolean>('S3_USE_SSL') ?? false;
    const protocol = useSsl ? 'https' : 'http';
    const host = this.config.get<string>('S3_ENDPOINT');
    const port = this.config.get<number>('S3_PORT');
    this.endpointBase = `${protocol}://${host}:${port}`;

    // R2 (and some S3 providers) serve public files from a different
    // domain than the S3 API endpoint. If S3_PUBLIC_URL is set, use it
    // for public URLs; otherwise fall back to the S3 endpoint (MinIO
    // works this way because the same host serves both API and files).
    const publicUrlOverride = this.config.get<string>('S3_PUBLIC_URL');
    this.publicBaseUrl =
      publicUrlOverride && publicUrlOverride.length > 0
        ? publicUrlOverride.replace(/\/$/, '') // strip trailing slash
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
  }

  async onModuleInit(): Promise<void> {
    await this.ensureBucketExists();
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

  /** Build the direct public URL for a key. Only valid for covers/*. */
  publicUrl(key: string): string {
    return `${this.publicBaseUrl}/${this.bucket}/${key}`;
  }

  /** Inverse of publicUrl — extract the S3 key from a stored cover URL. */
  keyFromUrl(url: string): string | null {
    const prefix = `${this.publicBaseUrl}/${this.bucket}/`;
    if (!url.startsWith(prefix)) return null;
    return url.slice(prefix.length);
  }

  /**
   * Generates a short-lived presigned GET URL for a private object.
   * Anyone holding the URL can fetch the object until it expires —
   * that's why the TTL is short (spec: "a few minutes is sufficient").
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
   * Grants anonymous read on covers/* only. PDFs remain private.
   * Wrapped in try/catch: some MinIO configurations reject anonymous
   * policies, and we don't want the app to fail to boot over it.
   * If this fails, covers will still upload but the public URL won't
   * resolve — Section 6C's signed-URL test covers the PDF side anyway.
   */
  private async ensureCoversArePublicReadable(): Promise<void> {
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

    try {
      await this.client.send(
        new PutBucketPolicyCommand({
          Bucket: this.bucket,
          Policy: JSON.stringify(policy),
        }),
      );
      this.logger.log('Bucket policy set: covers/* is publicly readable');
    } catch (err) {
      this.logger.warn(
        `Could not set bucket policy (covers may not be publicly readable): ${(err as Error).message}`,
      );
    }
  }
}
