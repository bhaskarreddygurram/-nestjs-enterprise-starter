import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PasswordResetToken, User } from '@prisma/client';
import { AuditEmitter } from '../audit/audit.emitter';
import { MAIL_PROVIDER } from '../mail/mail.interface';
import { UsersService } from '../users/users.service';
import { PasswordResetRepository } from './password-reset.repository';
import { PasswordResetService } from './password-reset.service';
import { RefreshTokenService } from './refresh-token.service';

const user: User = {
  id: 'u1',
  email: 'jane@example.com',
  passwordHash: 'x',
  firstName: null,
  lastName: null,
  isActive: true,
  twoFactorEnabled: false,
  twoFactorSecret: null,
  failedLoginAttempts: 0,
  lockedUntil: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

const tokenRow = (
  over: Partial<PasswordResetToken> = {},
): PasswordResetToken => ({
  id: 't1',
  userId: 'u1',
  tokenHash: 'hash',
  expiresAt: new Date(Date.now() + 60_000),
  usedAt: null,
  createdAt: new Date(),
  ...over,
});

describe('PasswordResetService', () => {
  let service: PasswordResetService;
  let users: jest.Mocked<
    Pick<UsersService, 'findEntityByEmail' | 'setPassword'>
  >;
  let repo: jest.Mocked<PasswordResetRepository>;
  let refreshTokens: jest.Mocked<Pick<RefreshTokenService, 'revokeAll'>>;
  let mail: { send: jest.Mock };

  beforeEach(async () => {
    mail = { send: jest.fn().mockResolvedValue(undefined) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PasswordResetService,
        {
          provide: UsersService,
          useValue: {
            findEntityByEmail: jest.fn(),
            setPassword: jest.fn(),
          },
        },
        {
          provide: PasswordResetRepository,
          useValue: {
            create: jest.fn(),
            findByHash: jest.fn(),
            markUsed: jest.fn(),
            invalidateAllForUser: jest.fn(),
          },
        },
        { provide: RefreshTokenService, useValue: { revokeAll: jest.fn() } },
        {
          provide: ConfigService,
          useValue: { get: jest.fn((_k: string, d?: unknown) => d) },
        },
        { provide: AuditEmitter, useValue: { emit: jest.fn() } },
        { provide: MAIL_PROVIDER, useValue: mail },
      ],
    }).compile();

    service = module.get(PasswordResetService);
    users = module.get(UsersService);
    repo = module.get(PasswordResetRepository);
    refreshTokens = module.get(RefreshTokenService);
  });

  describe('request', () => {
    it('does nothing (no token, no mail) for an unknown email', async () => {
      users.findEntityByEmail.mockResolvedValue(null);
      await service.request('ghost@example.com');
      expect(repo.create).not.toHaveBeenCalled();
      expect(mail.send).not.toHaveBeenCalled();
    });

    it('creates a token and emails the link for a known user', async () => {
      users.findEntityByEmail.mockResolvedValue(user);
      await service.request(user.email);
      expect(repo.create).toHaveBeenCalledTimes(1);
      expect(mail.send).toHaveBeenCalledTimes(1);
    });
  });

  describe('reset', () => {
    it('rejects an unknown token', async () => {
      repo.findByHash.mockResolvedValue(null);
      await expect(service.reset('raw', 'N3w!Passw0rd')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects an already-used token', async () => {
      repo.findByHash.mockResolvedValue(tokenRow({ usedAt: new Date() }));
      await expect(service.reset('raw', 'N3w!Passw0rd')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects an expired token', async () => {
      repo.findByHash.mockResolvedValue(
        tokenRow({ expiresAt: new Date(Date.now() - 1000) }),
      );
      await expect(service.reset('raw', 'N3w!Passw0rd')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('sets the password and revokes all sessions on a valid token', async () => {
      repo.findByHash.mockResolvedValue(tokenRow());
      await service.reset('raw', 'N3w!Passw0rd');
      expect(users.setPassword).toHaveBeenCalledWith('u1', 'N3w!Passw0rd');
      expect(repo.markUsed).toHaveBeenCalledWith('t1');
      expect(refreshTokens.revokeAll).toHaveBeenCalledWith('u1');
    });
  });
});
