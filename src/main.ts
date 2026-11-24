import { ExpressAlbumRouter } from './album/infrastructure/ExpressAlbumRouter.ts';
import { Router } from 'express';
import { ExpressEventRouter } from './event/infrastructure/ExpressEventRouter.ts';
import { createServiceContainer } from './shared/infrastructure/ServiceContainer.ts';
import { readEnv } from './shared/infrastructure/Env.ts';
import { createHttpApp } from './shared/infrastructure/HttpApp.ts';
import { postgresStartupMessage } from './shared/infrastructure/Postgres.ts';
import { ExpressUserRouter } from './user/infrastructure/ExpressUserRouter.ts';
import { ActivityChatRealtime } from './event/infrastructure/ActivityChatRealtime.ts';

const config = readEnv();
let services: Awaited<ReturnType<typeof createServiceContainer>>;
try {
  services = await createServiceContainer(config);
} catch (error) {
  console.error(postgresStartupMessage(error));
  process.exit(1);
}

const realtime = new ActivityChatRealtime();
const app = createHttpApp(Router().use(ExpressAlbumRouter(services.albums, services.container.user), ExpressEventRouter(services.events, services.container.user, services.chats, realtime, services.attendance), ExpressUserRouter(services.container.user)));
const server = app.listen(config.port, '0.0.0.0', () => console.log(`API escuchando en puerto ${config.port}`));
realtime.attach(server, token => services.container.user.getCurrent.execute(token), services.chats);
void services.chats.purgeExpired().catch(() => console.error('No se pudo ejecutar la limpieza inicial del chat.'));
const chatCleanup = setInterval(() => {
  void services.chats.purgeExpired().catch(() => console.error('No se pudo ejecutar la limpieza periódica del chat.'));
}, 6 * 60 * 60 * 1000);
chatCleanup.unref();
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    clearInterval(chatCleanup);
    realtime.close();
    server.close(() => { void services.close(); });
    setTimeout(() => process.exit(1), 10000).unref();
  });
}
