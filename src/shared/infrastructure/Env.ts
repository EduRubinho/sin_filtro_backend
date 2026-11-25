export function readEnv(env: NodeJS.ProcessEnv = process.env) {
  function required(name: string): string {
    const value = env[name];
    if (!value) throw new Error(`Falta configurar ${name} en .env.`);
    return value;
  }

  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT inválido.');
  const attendancePinSecret = required('ATTENDANCE_PIN_SECRET');
  if (!/^[a-f0-9]{64}$/i.test(attendancePinSecret)) throw new Error('ATTENDANCE_PIN_SECRET debe tener 64 caracteres hexadecimales.');
  return {
    port,
    attendancePinSecret,
    databaseUrl: required('DATABASE_URL'),
  };
}

export type AppConfig = ReturnType<typeof readEnv>;
