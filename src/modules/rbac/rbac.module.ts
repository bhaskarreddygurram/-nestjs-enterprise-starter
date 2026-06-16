import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { RbacController } from './rbac.controller';
import { RbacRepository } from './rbac.repository';
import { RbacService } from './rbac.service';

/**
 * Authorization module. Exports RbacService so the Auth module's JWT strategy
 * can resolve a user's roles/permissions when building the request principal.
 */
@Module({
  imports: [UsersModule],
  controllers: [RbacController],
  providers: [RbacService, RbacRepository],
  exports: [RbacService],
})
export class RbacModule {}
