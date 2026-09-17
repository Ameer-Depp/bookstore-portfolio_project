import { Controller, Get, UseGuards } from '@nestjs/common';
import { LibraryService } from './library.service';
import { LibraryResponse } from './library-response';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../entities/user.entity';

@Controller('library')
@UseGuards(JwtAuthGuard)
export class LibraryController {
  constructor(private readonly libraryService: LibraryService) {}

  @Get()
  getLibrary(@CurrentUser() user: User): Promise<LibraryResponse> {
    return this.libraryService.getLibrary(user.id);
  }
}
