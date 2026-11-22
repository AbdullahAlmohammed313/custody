import { Controller, Get } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { auth } from '../Auth/auth';
import { UserModel } from '../docs/models';

@ApiTags('Users')
@ApiCookieAuth()
@Controller('users')
export class UsersController {
  // The signed-in user's profile. Like every NestJS route, it requires a session
  // and is blocked while a password change is pending
  @Get('me')
  @ApiOkResponse({ type: UserModel })
  me(@Session() session: UserSession<typeof auth>) {
    return session.user;
  }
}
