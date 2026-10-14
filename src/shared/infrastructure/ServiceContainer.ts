import { UserLogin } from '../../user/application/UserLogin.ts';
import { UserGetCurrent } from '../../user/application/UserGetCurrent.ts';
import { UserLogout } from '../../user/application/UserLogout.ts';
import { UserCreate } from '../../user/application/UserCreate.ts';
import { UserGetAll } from '../../user/application/UserGetAll.ts';
import { UserGetOneById } from '../../user/application/UserGetOneById.ts';
import { UserEdit } from '../../user/application/UserEdit.ts';
import { UserDelete } from '../../user/application/UserDelete.ts';
import type { UserRepository } from '../../user/domain/UserRepository.ts';
import type { PasswordVerifier } from '../../user/domain/PasswordVerifier.ts';
import type { PasswordHasher } from '../../user/domain/PasswordHasher.ts';
import type { SessionRepository } from '../../user/domain/SessionRepository.ts';
import { UserEmail } from '../../user/domain/UserEmail.ts';
import { PostgresUserRepository } from '../../user/infrastructure/PostgresUserRepository.ts';
import { memorySessions } from '../../user/infrastructure/InMemorySessionRepository.ts';
import { scryptPasswords } from '../../user/infrastructure/ScryptPasswords.ts';
import type { AppConfig } from './Env.ts';
import { createPostgresPool } from './Postgres.ts';

// Único punto de composición: los casos de uso reciben puertos, nunca otros casos.
export class ServiceContainer {
  readonly user: {
    login: UserLogin;
    getCurrent: UserGetCurrent;
    logout: UserLogout;
    create: UserCreate;
    getAll: UserGetAll;
    getOneById: UserGetOneById;
    edit: UserEdit;
    delete: UserDelete;
  };

  constructor(users: UserRepository, passwords: PasswordVerifier & PasswordHasher, sessions: SessionRepository) {
    this.user = {
      login: new UserLogin(users, passwords, sessions),
      getCurrent: new UserGetCurrent(users, sessions),
      logout: new UserLogout(sessions),
      create: new UserCreate(users, passwords),
      getAll: new UserGetAll(users),
      getOneById: new UserGetOneById(users),
      edit: new UserEdit(users, passwords, sessions),
      delete: new UserDelete(users, sessions),
    };
  }
}

export async function createServiceContainer(config: AppConfig) {
  const pool = createPostgresPool(config.databaseUrl);
  try {
    const users = new PostgresUserRepository(pool);
    await pool.query('SELECT 1');
    await users.findByEmail(new UserEmail('schema-check@invalid.example'));
    const container = new ServiceContainer(users, await scryptPasswords(), memorySessions());
    return { container, close: () => pool.end() };
  } catch (error) {
    await pool.end();
    throw error;
  }
}
