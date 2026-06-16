import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';

export type RoleWithPermissions = Role & {
  permissions: { permission: { resource: string; action: string } }[];
};

/** Data-access for roles, permissions, and user-role assignments. */
@Injectable()
export class RbacRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** All roles a user holds, each with its permissions joined in. */
  findRolesWithPermissionsByUser(
    userId: string,
  ): Promise<RoleWithPermissions[]> {
    return this.prisma.role.findMany({
      where: { users: { some: { userId } } },
      include: { permissions: { include: { permission: true } } },
    });
  }

  listRoles(): Promise<Role[]> {
    return this.prisma.role.findMany({ orderBy: { name: 'asc' } });
  }

  findRoleByName(name: string): Promise<Role | null> {
    return this.prisma.role.findUnique({ where: { name } });
  }

  assignRole(userId: string, roleId: string): Promise<unknown> {
    return this.prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId } },
      update: {},
      create: { userId, roleId },
    });
  }

  removeRole(userId: string, roleId: string): Promise<unknown> {
    return this.prisma.userRole.deleteMany({ where: { userId, roleId } });
  }
}
