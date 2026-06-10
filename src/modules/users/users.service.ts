import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { PageMetaDto, PaginatedDto } from '../../common/dto/page-meta.dto';
import { parseSort } from '../../common/utils/sort.util';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserQueryDto, USER_SORTABLE_FIELDS } from './dto/user-query.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UsersRepository } from './users.repository';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async create(dto: CreateUserDto): Promise<UserResponseDto> {
    const existing = await this.usersRepository.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException(`Email "${dto.email}" is already in use`);
    }

    const passwordHash = await argon2.hash(dto.password);
    const user = await this.usersRepository.create({
      email: dto.email,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      isActive: dto.isActive ?? true,
    });

    return UserResponseDto.fromEntity(user);
  }

  async findAll(query: UserQueryDto): Promise<PaginatedDto<UserResponseDto>> {
    const where: Prisma.UserWhereInput = {};

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }
    if (query.search) {
      where.OR = [
        { email: { contains: query.search, mode: 'insensitive' } },
        { firstName: { contains: query.search, mode: 'insensitive' } },
        { lastName: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const orderBy = parseSort(query.sort, USER_SORTABLE_FIELDS);

    const [users, totalItems] = await Promise.all([
      this.usersRepository.findMany({
        skip: query.skip,
        take: query.limit,
        where,
        orderBy,
      }),
      this.usersRepository.count(where),
    ]);

    return new PaginatedDto(
      users.map((user) => UserResponseDto.fromEntity(user)),
      new PageMetaDto(query.page, query.limit, totalItems),
    );
  }

  async findOne(id: string): Promise<UserResponseDto> {
    const user = await this.usersRepository.findById(id);
    if (!user) {
      throw new NotFoundException(`User with id "${id}" not found`);
    }
    return UserResponseDto.fromEntity(user);
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserResponseDto> {
    const user = await this.usersRepository.findById(id);
    if (!user) {
      throw new NotFoundException(`User with id "${id}" not found`);
    }

    if (dto.email && dto.email !== user.email) {
      const emailTaken = await this.usersRepository.findByEmail(dto.email);
      if (emailTaken) {
        throw new ConflictException(`Email "${dto.email}" is already in use`);
      }
    }

    const updated = await this.usersRepository.update(id, dto);
    return UserResponseDto.fromEntity(updated);
  }

  async remove(id: string): Promise<void> {
    const user = await this.usersRepository.findById(id);
    if (!user) {
      throw new NotFoundException(`User with id "${id}" not found`);
    }
    await this.usersRepository.softDelete(id);
  }
}
