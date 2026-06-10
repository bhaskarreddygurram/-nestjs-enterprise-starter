import { Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';

/**
 * Data-access layer for users — the ONLY place in the module that touches
 * Prisma. The service above it deals in domain intent, never in query syntax.
 *
 * Soft-delete convention: every read excludes `deletedAt != null` rows;
 * `softDelete` stamps the row instead of removing it.
 */
@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.UserCreateInput): Promise<User> {
    return this.prisma.user.create({ data });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findFirst({ where: { id, deletedAt: null } });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findFirst({ where: { email, deletedAt: null } });
  }

  findMany(params: {
    skip: number;
    take: number;
    where: Prisma.UserWhereInput;
    orderBy: Prisma.UserOrderByWithRelationInput[];
  }): Promise<User[]> {
    return this.prisma.user.findMany({
      ...params,
      where: { ...params.where, deletedAt: null },
    });
  }

  count(where: Prisma.UserWhereInput): Promise<number> {
    return this.prisma.user.count({ where: { ...where, deletedAt: null } });
  }

  update(id: string, data: Prisma.UserUpdateInput): Promise<User> {
    return this.prisma.user.update({ where: { id }, data });
  }

  softDelete(id: string): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }
}
