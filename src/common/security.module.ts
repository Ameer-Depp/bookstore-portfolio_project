import { Global, Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

/**
 * Global module that makes JwtAuthGuard, RolesGuard, and PassportModule
 * available in every module without explicit imports.
 *
 * Why this exists: JwtAuthGuard extends AuthGuard('jwt'), which has an
 * implicit dependency on passport's AuthModuleOptions token. Any module
 * whose controller uses @UseGuards(JwtAuthGuard) needs that token in its
 * own DI context. Rather than repeat PassportModule.register(...) in every
 * feature module, we register it once here as @Global().
 */
@Global()
@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
  providers: [JwtAuthGuard, RolesGuard],
  exports: [PassportModule, JwtAuthGuard, RolesGuard],
})
export class SecurityModule {}
