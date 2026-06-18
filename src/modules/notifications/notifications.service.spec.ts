import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Notification } from '@prisma/client';
import { MAIL_PROVIDER } from '../mail/mail.interface';
import { NotificationsRepository } from './notifications.repository';
import { NotificationsService } from './notifications.service';

const notif: Notification = {
  id: 'n1',
  userId: 'u1',
  type: 'welcome',
  title: 'Welcome',
  message: 'Hi',
  readAt: null,
  createdAt: new Date(),
};

describe('NotificationsService', () => {
  let service: NotificationsService;
  let repo: jest.Mocked<NotificationsRepository>;
  let mail: { send: jest.Mock };

  beforeEach(async () => {
    mail = { send: jest.fn().mockResolvedValue(undefined) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        {
          provide: NotificationsRepository,
          useValue: {
            create: jest.fn().mockResolvedValue(notif),
            findByIdForUser: jest.fn(),
            findManyForUser: jest.fn(),
            countForUser: jest.fn(),
            countUnreadForUser: jest.fn(),
            markRead: jest.fn(),
            markAllReadForUser: jest.fn(),
          },
        },
        { provide: MAIL_PROVIDER, useValue: mail },
      ],
    }).compile();

    service = module.get(NotificationsService);
    repo = module.get(NotificationsRepository);
  });

  describe('markRead', () => {
    it('throws 404 when the notification is not the user’s', async () => {
      repo.findByIdForUser.mockResolvedValue(null);
      await expect(service.markRead('u1', 'n1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('marks an unread notification read', async () => {
      repo.findByIdForUser.mockResolvedValue(notif);
      repo.markRead.mockResolvedValue({ ...notif, readAt: new Date() });

      const result = await service.markRead('u1', 'n1');
      expect(repo.markRead).toHaveBeenCalledWith('n1');
      expect(result.read).toBe(true);
    });

    it('is a no-op (no extra write) when already read', async () => {
      repo.findByIdForUser.mockResolvedValue({ ...notif, readAt: new Date() });
      await service.markRead('u1', 'n1');
      expect(repo.markRead).not.toHaveBeenCalled();
    });
  });

  describe('handleUserRegistered', () => {
    it('sends a welcome email and creates an in-app notification', async () => {
      await service.handleUserRegistered({
        userId: 'u1',
        email: 'jane@example.com',
        name: 'Jane',
      });

      expect(mail.send).toHaveBeenCalledTimes(1);
      const sent = (
        mail.send.mock.calls[0] as [{ to: string; subject: string }]
      )[0];
      expect(sent.to).toBe('jane@example.com');
      expect(sent.subject).toMatch(/welcome/i);
      expect(repo.create).toHaveBeenCalledTimes(1);
    });

    it('never throws even if mail delivery fails', async () => {
      mail.send.mockRejectedValue(new Error('smtp down'));
      await expect(
        service.handleUserRegistered({ userId: 'u1', email: 'x@e.com' }),
      ).resolves.toBeUndefined();
    });
  });
});
