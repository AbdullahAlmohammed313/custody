import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { auth } from './Auth/auth';
import { SessionGuard } from './Auth/session.guard';
import { UsersController } from './users/users.controller';

@Module({
  imports: [
    AuthModule.forRoot({
      auth,
      disableTrustedOriginsCors: true,
      // SessionGuard extends the library's AuthGuard and replaces it
      disableGlobalAuthGuard: true,
    }),
  ],
  controllers: [UsersController],
  providers: [{ provide: APP_GUARD, useClass: SessionGuard }],
})
export class AppModule {}
