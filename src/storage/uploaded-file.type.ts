/**
 * Shape of a file produced by NestJS's FileInterceptor (multer under the hood).
 *
 * Named `UploadedFileType` (not `UploadedFile`) to avoid colliding with the
 * `@UploadedFile()` decorator exported by @nestjs/common.
 */
export interface UploadedFileType {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}
