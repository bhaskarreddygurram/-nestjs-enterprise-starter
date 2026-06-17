import { ApiProperty } from '@nestjs/swagger';
import { Notification } from '@prisma/client';

export class NotificationResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'welcome' })
  type!: string;

  @ApiProperty({ example: 'Welcome to the platform' })
  title!: string;

  @ApiProperty()
  message!: string;

  @ApiProperty({ example: false })
  read!: boolean;

  @ApiProperty()
  createdAt!: Date;

  static fromEntity(n: Notification): NotificationResponseDto {
    const dto = new NotificationResponseDto();
    dto.id = n.id;
    dto.type = n.type;
    dto.title = n.title;
    dto.message = n.message;
    dto.read = n.readAt !== null;
    dto.createdAt = n.createdAt;
    return dto;
  }
}
