import type { INestApplication } from '@nestjs/common';
import {
  DocumentBuilder,
  SwaggerModule,
  type OpenAPIObject,
} from '@nestjs/swagger';
import { auth } from '../Auth/auth';
import { docModels } from './models';

const AUTH_BASE_PATH = '/api/auth';

// Auth routes that are turned off in src/Auth/auth.ts, hidden from the docs
const HIDDEN_AUTH_PATHS = new Set([
  ...(auth.options.disabledPaths ?? []),
  '/sign-up/email', // emailAndPassword.disableSignUp
]);

// Builds the Swagger docs: NestJS routes + Better Auth routes + database models
export async function setupSwagger(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('Custody API')
    .setDescription('API documentation for the university custody system')
    .setVersion('0.0.1')
    .addCookieAuth('better-auth.session_token')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    extraModels: docModels,
  });

  mergeAuthDocument(document, await auth.api.generateOpenAPISchema());

  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs/json',
    swaggerOptions: { persistAuthorization: true, withCredentials: true },
  });
}

type AuthDocument = Awaited<ReturnType<typeof auth.api.generateOpenAPISchema>>;

function mergeAuthDocument(document: OpenAPIObject, authDoc: AuthDocument) {
  // Better Auth paths are relative, so prefix them with /api/auth and group them under the Auth tag
  for (const [path, item] of Object.entries(authDoc.paths)) {
    if (HIDDEN_AUTH_PATHS.has(path)) continue;
    const operations = Object.values(
      item as Record<string, { tags?: string[] }>,
    );
    for (const op of operations) {
      op.tags = (op.tags ?? ['Default']).map((tag) =>
        tag === 'Default' ? 'Auth' : `Auth / ${tag}`,
      );
    }
    document.paths[`${AUTH_BASE_PATH}${path}`] = item as never;
  }

  document.components = {
    ...document.components,
    schemas: {
      ...(authDoc.components?.schemas as object),
      ...document.components?.schemas,
    },
    securitySchemes: {
      ...(authDoc.components?.securitySchemes as object),
      ...document.components?.securitySchemes,
    },
  };

  document.tags = [
    {
      name: 'Auth',
      description: 'Sign-in, account management and sessions (Better Auth)',
    },
    ...(document.tags ?? []),
  ];
}
