export function readEnv(env: NodeJS.ProcessEnv = process.env) {
  function required(name: string): string {
    const value = env[name];
    if (!value) throw new Error(`Falta configurar ${name} en .env.`);
    return value;
  }

  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT inválido.');
  return {
    port,
    databaseUrl: required('DATABASE_URL'),
  };
}

export type AppConfig = ReturnType<typeof readEnv>;
