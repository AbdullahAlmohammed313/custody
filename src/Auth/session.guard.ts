import {
  ForbiddenException,
  Injectable,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AllowAnonymous, AuthGuard } from '@thallesp/nestjs-better-auth';
import type { Request } from 'express';
import type { auth } from './auth';
import { PASSWORD_CHANGE_REQUIRED } from './password-change';

type AuthSession = typeof auth.$Infer.Session;

// Metadata key set by @AllowAnonymous(), read from the decorator itself so it
// stays in sync with the library
const PUBLIC_KEY = AllowAnonymous().KEY;

// Reflector only reads decorator metadata, so a local instance is enough
// (AuthGuard keeps its own instance private)
const reflector = new Reflector();

// The app's single global guard. It runs the library's AuthGuard (session,
// 401, @Roles) and then blocks every non-public route while the user still has
// to change the password an admin gave them. Extending AuthGuard keeps it to
// one session lookup per request and guarantees the order of the two checks.
@Injectable()
export class SessionGuard extends AuthGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const allowed = await super.canActivate(context);
    if (!allowed || context.getType() !== 'http') return allowed;

    const isPublic = reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // AuthGuard has attached the session to the request
    const { session } = context
      .switchToHttp()
      .getRequest<Request & { session?: AuthSession | null }>();

    if (session?.user.mustChangePassword) {
      throw new ForbiddenException(PASSWORD_CHANGE_REQUIRED);
    }
    return true;
  }
}
