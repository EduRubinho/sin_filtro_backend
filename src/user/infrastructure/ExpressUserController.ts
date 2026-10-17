import type { UserRegister } from '../application/UserRegister.ts';
import type { UserUpdateProfile } from '../application/UserUpdateProfile.ts';
import type { UserGetCategories } from '../application/UserGetCategories.ts';
import type { Request, RequestHandler } from 'express';
import type { UserLogin } from '../application/UserLogin.ts';
import type { UserGetCurrent } from '../application/UserGetCurrent.ts';
import type { UserLogout } from '../application/UserLogout.ts';
import type { UserCreate } from '../application/UserCreate.ts';
import type { UserGetAll } from '../application/UserGetAll.ts';
import type { UserGetOneById } from '../application/UserGetOneById.ts';
import type { UserEdit } from '../application/UserEdit.ts';
import type { UserDelete } from '../application/UserDelete.ts';
import { AuthError } from '../domain/AuthError.ts';

function bearer(req: Request): string {
  const match = /^Bearer (.+)$/.exec(req.headers.authorization ?? '');
  if (!match) throw new AuthError('UNAUTHORIZED');
  return match[1];
}

export interface UserUseCases {
  register: UserRegister;
  updateProfile: UserUpdateProfile;
  categories: UserGetCategories;
  login: UserLogin;
  getCurrent: UserGetCurrent;
  logout: UserLogout;
  create: UserCreate;
  getAll: UserGetAll;
  getOneById: UserGetOneById;
  edit: UserEdit;
  delete: UserDelete;
}

export class ExpressUserController {
  readonly register: RequestHandler;
  readonly updateProfile: RequestHandler;
  readonly categories: RequestHandler;
  readonly requireAdmin: RequestHandler;
  readonly login: RequestHandler;
  readonly me: RequestHandler;
  readonly logout: RequestHandler;
  readonly create: RequestHandler;
  readonly getAll: RequestHandler;
  readonly getOneById: RequestHandler;
  readonly edit: RequestHandler;
  readonly delete: RequestHandler;

  constructor(users: UserUseCases) {
    this.register = async (req, res) => { res.status(201).json(await users.register.execute(req.body)); };
    this.updateProfile = async (req, res) => { res.json({ user: await users.updateProfile.execute(bearer(req), req.body) }); };
    this.categories = async (_req, res) => { res.json({ categories: await users.categories.execute() }); };
    this.requireAdmin = async (req, _res, next) => {
      const user = await users.getCurrent.execute(bearer(req));
      if (user.role !== 'admin') throw new AuthError('FORBIDDEN');
      next();
    };
    this.login = async (req, res) => { res.json(await users.login.execute(req.body)); };
    this.me = async (req, res) => { res.json({ user: await users.getCurrent.execute(bearer(req)) }); };
    this.logout = async (req, res) => {
      await users.logout.execute(bearer(req));
      res.status(204).end();
    };
    this.create = async (req, res) => {
      const user = await users.create.execute(req.body);
      res.location(`/users/${user.id}`).status(201).json({ user });
    };
    this.getAll = async (req, res) => {
      const limit = req.query.limit === undefined ? 50 : paginationNumber(req.query.limit);
      const offset = req.query.offset === undefined ? 0 : paginationNumber(req.query.offset);
      res.json({ users: await users.getAll.execute(limit, offset) });
    };
    this.getOneById = async (req, res) => { res.json({ user: await users.getOneById.execute(req.params.id) }); };
    this.edit = async (req, res) => { res.json({ user: await users.edit.execute(req.params.id, req.body) }); };
    this.delete = async (req, res) => {
      await users.delete.execute(req.params.id);
      res.status(204).end();
    };
  }
}

function paginationNumber(value: unknown): number {
  return typeof value === 'string' && /^[0-9]+$/.test(value) ? Number(value) : NaN;
}
