import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtSignOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthorizationGuard } from '../../common/guards/authorization.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { MailModule } from '../mail/mail.module';
import { RbacModule } from '../rbac/rbac.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordResetRepository } from './password-reset.repository';
import { PasswordResetService } from './password-reset.service';
import { RefreshTokenRepository } from './refresh-token.repository';
import { RefreshTokenService } from './refresh-token.service';
import { TwoFactorController } from './two-factor.controller';
import { TwoFactorRepository } from './two-factor.repository';
import { TwoFactorService } from './two-factor.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    UsersModule,
    RbacModule,
    MailModule,
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.accessSecret'),
        signOptions: {
          // ms `StringValue` (e.g. '15m') is stricter than plain string.
          expiresIn: config.get<string>(
            'jwt.accessExpiresIn',
            '15m',
          ) as JwtSignOptions['expiresIn'],
        },
      }),
    }),
  ],
  controllers: [AuthController, TwoFactorController],
  providers: [
    AuthService,
    JwtStrategy,
    RefreshTokenService,
    RefreshTokenRepository,
    PasswordResetService,
    PasswordResetRepository,
    TwoFactorService,
    TwoFactorRepository,
    // Order matters: authentication first (populates request.user), then
    // authorization reads the principal's roles/permissions.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: AuthorizationGuard },
  ],
})
export class AuthModule {}
