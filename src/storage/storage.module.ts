import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service';

/**
 * Global so any feature module can inject StorageService without
 * importing this module repeatedly. It's a stateless singleton, so
 * @Global() has no downside here.
 */
@Global()
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
