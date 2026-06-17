import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AppEvent, UserRegisteredEvent } from '../../shared/events/app.event';
import { NotificationsService } from './notifications.service';

/**
 * Reacts to domain events. Auth emits `user.registered` and has no idea
 * notifications exist — the reaction lives entirely here.
 */
@Injectable()
export class NotificationsListener {
  constructor(private readonly notificationsService: NotificationsService) {}

  @OnEvent(AppEvent.USER_REGISTERED)
  async onUserRegistered(event: UserRegisteredEvent): Promise<void> {
    await this.notificationsService.handleUserRegistered(event);
  }
}
