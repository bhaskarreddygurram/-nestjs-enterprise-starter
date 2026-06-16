import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from '../users/users.service';
import { RbacRepository, RoleWithPermissions } from './rbac.repository';
import { RbacService } from './rbac.service';

describe('RbacService', () => {
  let service: RbacService;
  let repo: jest.Mocked<RbacRepository>;
  let users: jest.Mocked<Pick<UsersService, 'findEntityById'>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RbacService,
        {
          provide: RbacRepository,
          useValue: {
            findRolesWithPermissionsByUser: jest.fn(),
            listRoles: jest.fn(),
            findRoleByName: jest.fn(),
            assignRole: jest.fn(),
            removeRole: jest.fn(),
          },
        },
        {
          provide: UsersService,
          useValue: { findEntityById: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(RbacService);
    repo = module.get(RbacRepository);
    users = module.get(UsersService);
  });

  describe('getUserAuthorization', () => {
    it('flattens and de-duplicates permissions across roles', async () => {
      const roles: RoleWithPermissions[] = [
        {
          id: 'r1',
          name: 'admin',
          description: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          permissions: [
            { permission: { resource: 'user', action: 'read' } },
            { permission: { resource: 'user', action: 'create' } },
          ],
        },
        {
          id: 'r2',
          name: 'editor',
          description: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          permissions: [
            { permission: { resource: 'user', action: 'read' } }, // dup
            { permission: { resource: 'user', action: 'update' } },
          ],
        },
      ];
      repo.findRolesWithPermissionsByUser.mockResolvedValue(roles);

      const result = await service.getUserAuthorization('u1');

      expect(result.roles).toEqual(['admin', 'editor']);
      expect(result.permissions.sort()).toEqual([
        'user:create',
        'user:read',
        'user:update',
      ]);
    });

    it('returns empty arrays for a user with no roles', async () => {
      repo.findRolesWithPermissionsByUser.mockResolvedValue([]);
      const result = await service.getUserAuthorization('u1');
      expect(result).toEqual({ roles: [], permissions: [] });
    });
  });

  describe('assignRoleToUser', () => {
    it('throws 404 when the user does not exist', async () => {
      users.findEntityById.mockResolvedValue(null);
      await expect(service.assignRoleToUser('u1', 'admin')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws 404 when the role does not exist', async () => {
      users.findEntityById.mockResolvedValue({ id: 'u1' } as never);
      repo.findRoleByName.mockResolvedValue(null);
      await expect(service.assignRoleToUser('u1', 'ghost')).rejects.toThrow(
        'Role "ghost" not found',
      );
    });

    it('assigns when both exist', async () => {
      users.findEntityById.mockResolvedValue({ id: 'u1' } as never);
      repo.findRoleByName.mockResolvedValue({
        id: 'role-1',
        name: 'admin',
      } as never);

      await service.assignRoleToUser('u1', 'admin');
      expect(repo.assignRole).toHaveBeenCalledWith('u1', 'role-1');
    });
  });
});
