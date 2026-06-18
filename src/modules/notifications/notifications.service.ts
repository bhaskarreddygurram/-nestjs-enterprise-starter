import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PageMetaDto, PaginatedDto } from '../../common/dto/page-meta.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { UserRegisteredEvent } from '../../shared/events/app.event';
import { NotificationResponseDto } from './dto/notification-response.dto';
import { MAIL_PROVIDER, MailProvider } from '../mail/mail.interface';
import { NotificationsRepository } from './notifications.repository';
import { templates } from './templates';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly repository: NotificationsRepository,
    @Inject(MAIL_PROVIDER) private readonly mail: MailProvider,
  ) {}

  async listForUser(
    userId: string,
    query: PaginationQueryDto,
  ): Promise<PaginatedDto<NotificationResponseDto>> {
    const [items, totalItems] = await Promise.all([
      this.repository.findManyForUser({
        userId,
        skip: query.skip,
        take: query.limit,
      }),
      this.repository.countForUser(userId),
    ]);
    return new PaginatedDto(
      items.map((n) => NotificationResponseDto.fromEntity(n)),
      new PageMetaDto(query.page, query.limit, totalItems),
    );
  }

  unreadCount(userId: string): Promise<number> {
    return this.repository.countUnreadForUser(userId);
  }

  async markRead(userId: string, id: string): Promise<NotificationResponseDto> {
    const existing = await this.repository.findByIdForUser(id, userId);
    if (!existing) {
      throw new NotFoundException(`Notification "${id}" not found`);
    }
    const updated = existing.readAt
      ? existing
      : await this.repository.markRead(id);
    return NotificationResponseDto.fromEntity(updated);
  }

  async markAllRead(userId: string): Promise<void> {
    await this.repository.markAllReadForUser(userId);
  }

  /** Create an in-app notification (used internally + by listeners). */
  create(input: {
    userId: string;
    type: string;
    title: string;
    message: string;
  }): Promise<NotificationResponseDto> {
    return this.repository
      .create({
        type: input.type,
        title: input.title,
        message: input.message,
        user: { connect: { id: input.userId } },
      })
      .then((n) => NotificationResponseDto.fromEntity(n));
  }

  /**
   * Reaction to user registration: welcome email + in-app notification.
   * Errors are swallowed — a notification failure must not affect signup.
   */
  async handleUserRegistered(event: UserRegisteredEvent): Promise<void> {
    const name = event.name?.trim() || event.email;
    const rendered = templates.welcome(name);
    try {
      await this.mail.send({
        to: event.email,
        subject: rendered.subject,
        body: rendered.body,
      });
      await this.create({
        userId: event.userId,
        type: 'welcome',
        title: rendered.subject,
        message: rendered.body,
      });
    } catch (error) {
      this.logger.error(
        `Failed to deliver welcome notification: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }
}
