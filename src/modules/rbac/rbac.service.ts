import { Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { UsersService } from '../users/users.service';
import { RbacRepository } from './rbac.repository';

export interface UserAuthorization {
  roles: string[];
  permissions: string[];
}

@Injectable()
export class RbacService {
  constructor(
    private readonly repository: RbacRepository,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Resolve a user's roles and flattened, de-duplicated permission strings
   * (`resource:action`). Used by JwtStrategy to build the request principal.
   */
  async getUserAuthorization(userId: string): Promise<UserAuthorization> {
    const roles = await this.repository.findRolesWithPermissionsByUser(userId);

    const permissions = new Set<string>();
    for (const role of roles) {
      for (const rp of role.permissions) {
        permissions.add(`${rp.permission.resource}:${rp.permission.action}`);
      }
    }

    return {
      roles: roles.map((r) => r.name),
      permissions: [...permissions],
    };
  }

  listRoles(): Promise<Role[]> {
    return this.repository.listRoles();
  }

  async assignRoleToUser(userId: string, roleName: string): Promise<void> {
    const { role } = await this.resolve(userId, roleName);
    await this.repository.assignRole(userId, role.id);
  }

  async removeRoleFromUser(userId: string, roleName: string): Promise<void> {
    const { role } = await this.resolve(userId, roleName);
    await this.repository.removeRole(userId, role.id);
  }

  /** Validate that both the user and the role exist. */
  private async resolve(
    userId: string,
    roleName: string,
  ): Promise<{ role: Role }> {
    const user = await this.usersService.findEntityById(userId);
    if (!user) {
      throw new NotFoundException(`User with id "${userId}" not found`);
    }
    const role = await this.repository.findRoleByName(roleName);
    if (!role) {
      throw new NotFoundException(`Role "${roleName}" not found`);
    }
    return { role };
  }
}
