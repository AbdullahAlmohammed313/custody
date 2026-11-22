import { createApp } from './app.setup';
import { env } from './config/env';

async function bootstrap() {
  const app = await createApp();
  await app.listen(env.PORT);
  console.log(`server running on ${env.PORT}`);
  console.log(`swagger docs on http://localhost:${env.PORT}/docs`);
}
void bootstrap();
