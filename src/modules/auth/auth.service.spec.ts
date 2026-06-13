import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { User } from '@prisma/client';
import * as argon2 from 'argon2';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

jest.mock('argon2', () => ({
  verify: jest.fn(),
}));
const argon2Verify = argon2.verify as jest.Mock;

const entity: User = {
  id: 'a1b2c3d4-0000-4000-8000-000000000000',
  email: 'jane.doe@example.com',
  passwordHash: '$argon2id$stored-hash',
  firstName: 'Jane',
  lastName: 'Doe',
  isActive: true,
  twoFactorEnabled: false,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  deletedAt: null,
};

describe('AuthService', () => {
  let service: AuthService;
  let usersService: jest.Mocked<
    Pick<UsersService, 'create' | 'findEntityByEmail'>
  >;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: {
            create: jest.fn(),
            findEntityByEmail: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            signAsync: jest.fn().mockResolvedValue('signed.jwt.token'),
          },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('15m') },
        },
      ],
    }).compile();

    service = module.get(AuthService);
    usersService = module.get(UsersService);
    argon2Verify.mockReset();
  });

  describe('register', () => {
    it('creates the user and returns an access token + user', async () => {
      usersService.create.mockResolvedValue(UserResponseDto.fromEntity(entity));

      const result = await service.register({
        email: entity.email,
        password: 'Str0ng!Passw0rd',
      });

      expect(usersService.create).toHaveBeenCalled();
      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.tokenType).toBe('Bearer');
      expect(result.user.email).toBe(entity.email);
      expect(result.user).not.toHaveProperty('passwordHash');
    });
  });

  describe('login', () => {
    it('returns a token when credentials are valid', async () => {
      usersService.findEntityByEmail.mockResolvedValue(entity);
      argon2Verify.mockResolvedValue(true);

      const result = await service.login({
        email: entity.email,
        password: 'correct',
      });

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.user.id).toBe(entity.id);
    });

    it('throws 401 when the password is wrong', async () => {
      usersService.findEntityByEmail.mockResolvedValue(entity);
      argon2Verify.mockResolvedValue(false);

      await expect(
        service.login({ email: entity.email, password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws 401 when the user does not exist (no enumeration)', async () => {
      usersService.findEntityByEmail.mockResolvedValue(null);

      await expect(
        service.login({ email: 'ghost@example.com', password: 'whatever' }),
      ).rejects.toThrow(UnauthorizedException);
      expect(argon2Verify).not.toHaveBeenCalled();
    });

    it('throws 401 when the account is inactive', async () => {
      usersService.findEntityByEmail.mockResolvedValue({
        ...entity,
        isActive: false,
      });

      await expect(
        service.login({ email: entity.email, password: 'correct' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('returns 401 (not 500) when the stored hash is malformed', async () => {
      usersService.findEntityByEmail.mockResolvedValue({
        ...entity,
        passwordHash: 'not-a-valid-argon2-hash',
      });
      argon2Verify.mockRejectedValue(new Error('pchstr must contain a $'));

      await expect(
        service.login({ email: entity.email, password: 'correct' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
