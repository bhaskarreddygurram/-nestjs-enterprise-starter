import { Injectable } from '@nestjs/common';
import { PasswordResetToken } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';

/**
 * Data access for password-reset tokens. Only the SHA-256 hash of the token is
 * stored; lookups are by hash (the raw token lives only in the user's email).
 */
@Injectable()
export class PasswordResetRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<PasswordResetToken> {
    return this.prisma.passwordResetToken.create({ data });
  }

  findByHash(tokenHash: string): Promise<PasswordResetToken | null> {
    return this.prisma.passwordResetToken.findFirst({ where: { tokenHash } });
  }

  markUsed(id: string): Promise<PasswordResetToken> {
    return this.prisma.passwordResetToken.update({
      where: { id },
      data: { usedAt: new Date() },
    });
  }

  /** Invalidate every outstanding token for a user (after a successful reset). */
  async invalidateAllForUser(userId: string): Promise<void> {
    await this.prisma.passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });
  }
}
