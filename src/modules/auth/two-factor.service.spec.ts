import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { User } from '@prisma/client';
import { AuditEmitter } from '../audit/audit.emitter';
import { UsersService } from '../users/users.service';
import { generateSecret, generateTotp } from './totp.util';
import { TwoFactorRepository } from './two-factor.repository';
import { TwoFactorService } from './two-factor.service';

// Deterministic, fast hashing for the test.
jest.mock('argon2', () => ({
  hash: jest.fn((v: string) => Promise.resolve(`hashed:${v}`)),
  verify: jest.fn((hash: string, v: string) =>
    Promise.resolve(hash === `hashed:${v}`),
  ),
}));

const secret = generateSecret();

const baseUser: User = {
  id: 'u1',
  email: 'jane@example.com',
  passwordHash: 'x',
  firstName: null,
  lastName: null,
  isActive: true,
  twoFactorEnabled: false,
  twoFactorSecret: secret,
  failedLoginAttempts: 0,
  lockedUntil: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

describe('TwoFactorService', () => {
  let service: TwoFactorService;
  let users: jest.Mocked<
    Pick<
      UsersService,
      'findEntityById' | 'setTwoFactorSecret' | 'setTwoFactorEnabled'
    >
  >;
  let repo: jest.Mocked<TwoFactorRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TwoFactorService,
        {
          provide: UsersService,
          useValue: {
            findEntityById: jest.fn(),
            setTwoFactorSecret: jest.fn(),
            setTwoFactorEnabled: jest.fn(),
          },
        },
        {
          provide: TwoFactorRepository,
          useValue: {
            replaceCodes: jest.fn(),
            findUnusedForUser: jest.fn(),
            markUsed: jest.fn(),
            deleteAllForUser: jest.fn(),
          },
        },
        { provide: ConfigService, useValue: { get: jest.fn(() => 'Issuer') } },
        { provide: AuditEmitter, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get(TwoFactorService);
    users = module.get(UsersService);
    repo = module.get(TwoFactorRepository);
  });

  describe('enable', () => {
    it('activates 2FA and returns 10 recovery codes when the code is valid', async () => {
      users.findEntityById.mockResolvedValue(baseUser);
      const code = generateTotp(secret);

      const codes = await service.enable('u1', code);

      expect(codes).toHaveLength(10);
      expect(users.setTwoFactorEnabled).toHaveBeenCalledWith('u1', true);
      expect(repo.replaceCodes).toHaveBeenCalledWith('u1', expect.any(Array));
    });

    it('rejects an invalid TOTP code', async () => {
      users.findEntityById.mockResolvedValue(baseUser);
      await expect(service.enable('u1', '000000')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects enabling before setup (no secret)', async () => {
      users.findEntityById.mockResolvedValue({
        ...baseUser,
        twoFactorSecret: null,
      });
      await expect(service.enable('u1', '123456')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('verifyCode', () => {
    it('accepts a current TOTP code', async () => {
      const code = generateTotp(secret);
      await expect(service.verifyCode(baseUser, code)).resolves.toBe(true);
    });

    it('accepts and consumes a one-time recovery code', async () => {
      repo.findUnusedForUser.mockResolvedValue([
        {
          id: 'r1',
          userId: 'u1',
          codeHash: 'hashed:abcde-12345',
          usedAt: null,
          createdAt: new Date(),
        },
      ]);

      await expect(service.verifyCode(baseUser, 'ABCDE-12345')).resolves.toBe(
        true,
      );
      expect(repo.markUsed).toHaveBeenCalledWith('r1');
    });

    it('rejects an unknown code', async () => {
      repo.findUnusedForUser.mockResolvedValue([]);
      await expect(service.verifyCode(baseUser, 'nope-nope0')).resolves.toBe(
        false,
      );
    });
  });
});
