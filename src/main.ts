import { Router } from 'express';
import { ExpressEventRouter } from './event/infrastructure/ExpressEventRouter.ts';
import { createServiceContainer } from './shared/infrastructure/ServiceContainer.ts';
import { readEnv } from './shared/infrastructure/Env.ts';
import { createHttpApp } from './shared/infrastructure/HttpApp.ts';
import { postgresStartupMessage } from './shared/infrastructure/Postgres.ts';
import { ExpressUserRouter } from './user/infrastructure/ExpressUserRouter.ts';

const config = readEnv();
let services: Awaited<ReturnType<typeof createServiceContainer>>;
try {
  services = await createServiceContainer(config);
} catch (error) {
  console.error(postgresStartupMessage(error));
  process.exit(1);
}

const app = createHttpApp(Router().use(ExpressEventRouter(services.events, services.container.user), ExpressUserRouter(services.container.user)));
const server = app.listen(config.port, '0.0.0.0', () => console.log(`API escuchando en puerto ${config.port}`));
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    server.close(() => { void services.close(); });
    setTimeout(() => process.exit(1), 10000).unref();
  });
}
