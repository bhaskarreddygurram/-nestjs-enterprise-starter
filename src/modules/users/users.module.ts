import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

/**
 * Reference feature module — the pattern every future module follows:
 * controller (HTTP) → service (business rules) → repository (data access).
 *
 * Only `UsersService` is exported: other modules (e.g. Auth in Phase 3)
 * consume users through the service, never the repository.
 */
@Module({
  controllers: [UsersController],
  providers: [UsersService, UsersRepository],
  exports: [UsersService],
})
export class UsersModule {}
