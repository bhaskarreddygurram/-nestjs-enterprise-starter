import { Injectable } from '@nestjs/common';
import { TwoFactorRecoveryCode } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';

/**
 * Data access for 2FA recovery codes. Only argon2 hashes are stored. Codes are
 * single-use: verification marks the matching row used.
 */
@Injectable()
export class TwoFactorRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Replace any existing codes with a fresh set (called when (re)enabling 2FA). */
  async replaceCodes(userId: string, codeHashes: string[]): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.twoFactorRecoveryCode.deleteMany({ where: { userId } }),
      this.prisma.twoFactorRecoveryCode.createMany({
        data: codeHashes.map((codeHash) => ({ userId, codeHash })),
      }),
    ]);
  }

  /** Unused recovery codes for a user. */
  findUnusedForUser(userId: string): Promise<TwoFactorRecoveryCode[]> {
    return this.prisma.twoFactorRecoveryCode.findMany({
      where: { userId, usedAt: null },
    });
  }

  markUsed(id: string): Promise<TwoFactorRecoveryCode> {
    return this.prisma.twoFactorRecoveryCode.update({
      where: { id },
      data: { usedAt: new Date() },
    });
  }

  async deleteAllForUser(userId: string): Promise<void> {
    await this.prisma.twoFactorRecoveryCode.deleteMany({ where: { userId } });
  }
}
