import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { RefreshToken } from '@prisma/client';
import { RefreshTokenRepository } from './refresh-token.repository';
import { RefreshTokenService } from './refresh-token.service';

const USER_ID = 'a1b2c3d4-0000-4000-8000-000000000000';

describe('RefreshTokenService', () => {
  let service: RefreshTokenService;
  let repo: jest.Mocked<RefreshTokenRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefreshTokenService,
        {
          provide: RefreshTokenRepository,
          useValue: {
            create: jest.fn(),
            findById: jest.fn(),
            revoke: jest.fn(),
            revokeAllForUser: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(7) },
        },
      ],
    }).compile();

    service = module.get(RefreshTokenService);
    repo = module.get(RefreshTokenRepository);
  });

  // Captures the row "persisted" by issue() so rotate() can find it back.
  const wireIssue = (id: string): { getRow: () => RefreshToken } => {
    let row: RefreshToken;
    repo.create.mockImplementation((data) => {
      row = {
        id,
        userId: data.userId,
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
        revokedAt: null,
        replacedById: null,
        createdAt: new Date(),
      };
      return Promise.resolve(row);
    });
    return { getRow: () => row };
  };

  it('issue() returns an opaque "<id>.<secret>" token and stores only a hash', async () => {
    const { getRow } = wireIssue('row-1');
    const token = await service.issue(USER_ID);

    expect(token.startsWith('row-1.')).toBe(true);
    const secret = token.split('.')[1];
    expect(secret).toHaveLength(64); // 32 random bytes as hex
    // The raw secret must never be what we persisted.
    expect(getRow().tokenHash).not.toBe(secret);
    expect(getRow().tokenHash).toHaveLength(64); // sha256 hex
  });

  it('rotate() accepts a valid token, revokes it, and issues a new one', async () => {
    const { getRow } = wireIssue('row-1');
    const token = await service.issue(USER_ID);
    repo.findById.mockResolvedValue(getRow());

    // Next issue() (inside rotate) creates row-2.
    repo.create.mockResolvedValueOnce({
      ...getRow(),
      id: 'row-2',
    });

    const result = await service.rotate(token);

    expect(result.userId).toBe(USER_ID);
    expect(result.token.startsWith('row-2.')).toBe(true);
    expect(repo.revoke).toHaveBeenCalledWith('row-1', 'row-2');
  });

  it('rotate() rejects an unknown token', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(service.rotate('ghost.secret')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rotate() detects reuse of a revoked token and revokes ALL sessions', async () => {
    const revoked: RefreshToken = {
      id: 'row-1',
      userId: USER_ID,
      tokenHash: 'whatever',
      expiresAt: new Date(Date.now() + 100000),
      revokedAt: new Date(),
      replacedById: 'row-2',
      createdAt: new Date(),
    };
    repo.findById.mockResolvedValue(revoked);

    await expect(service.rotate('row-1.secret')).rejects.toThrow(
      'Refresh token already used',
    );
    expect(repo.revokeAllForUser).toHaveBeenCalledWith(USER_ID);
  });

  it('rotate() rejects an expired token', async () => {
    const { getRow } = wireIssue('row-1');
    const token = await service.issue(USER_ID);
    repo.findById.mockResolvedValue({
      ...getRow(),
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(service.rotate(token)).rejects.toThrow('expired');
  });

  it('rotate() rejects a tampered secret', async () => {
    const { getRow } = wireIssue('row-1');
    await service.issue(USER_ID);
    repo.findById.mockResolvedValue(getRow());

    await expect(service.rotate('row-1.wrong-secret')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('revoke() is a no-op for a malformed token', async () => {
    await service.revoke('no-dot-here');
    expect(repo.findById).not.toHaveBeenCalled();
  });

  it('revokeAll() delegates to the repository', async () => {
    await service.revokeAll(USER_ID);
    expect(repo.revokeAllForUser).toHaveBeenCalledWith(USER_ID);
  });
});
