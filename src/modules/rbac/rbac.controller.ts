import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { RbacService } from './rbac.service';
import { AssignRoleDto } from './dto/assign-role.dto';

/**
 * Role management. Every route is protected by the global JWT guard and
 * additionally gated by RBAC permissions (`role:read`, `role:assign`).
 */
@ApiTags('RBAC')
@ApiBearerAuth()
@Controller()
export class RbacController {
  constructor(private readonly rbacService: RbacService) {}

  @Get('roles')
  @Permissions('role:read')
  @ApiOperation({ summary: 'List all roles' })
  @ApiOkResponse({ description: 'Array of roles' })
  listRoles() {
    return this.rbacService.listRoles();
  }

  @Post('users/:userId/roles')
  @Permissions('role:assign')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Assign a role to a user' })
  @ApiNoContentResponse({ description: 'Role assigned (idempotent)' })
  async assignRole(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: AssignRoleDto,
  ): Promise<void> {
    await this.rbacService.assignRoleToUser(userId, dto.role);
  }

  @Delete('users/:userId/roles/:roleName')
  @Permissions('role:assign')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a role from a user' })
  @ApiNoContentResponse({ description: 'Role removed (idempotent)' })
  async removeRole(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('roleName') roleName: string,
  ): Promise<void> {
    await this.rbacService.removeRoleFromUser(userId, roleName);
  }
}
