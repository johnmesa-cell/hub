import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { env } from '../config/env';
import type { AuthUser, Project } from '../types';

type UserRow = AuthUser & { password: string };

const dataDir = path.dirname(env.dbPath);
fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(env.dbPath);
db.pragma('journal_mode = WAL');

const schemaPath = path.join(__dirname, 'migrations', '001_create_tables.sql');
db.exec(fs.readFileSync(schemaPath, 'utf8'));

const defaultProjects = [
  {
    name: 'Hub',
    slug: 'hub',
    url: 'https://tudominio.com',
    description: 'Portal central de administración',
    icon: '◆',
    active: 1,
    sort_order: 0
  },
  {
    name: 'Alex',
    slug: 'alex',
    url: 'https://alex.tudominio.com',
    description: 'Proyecto principal de Alex',
    icon: '◈',
    active: 1,
    sort_order: 1
  },
  {
    name: 'Proyecto X',
    slug: 'proyectox',
    url: 'https://proyectox.tudominio.com',
    description: 'Servicio externo enrutable',
    icon: '⬡',
    active: 1,
    sort_order: 2
  },
  {
    name: 'DB Admin',
    slug: 'db-admin',
    url: 'https://db-admin.tudominio.com',
    description: 'Acceso a administración de datos',
    icon: '◍',
    active: 1,
    sort_order: 3
  }
];

function seedProjects(): void {
  const count = db.prepare('SELECT COUNT(*) as count FROM projects').get() as { count: number };
  if (count.count > 0) {
    return;
  }

  const insert = db.prepare(
    'INSERT INTO projects (name, slug, url, description, icon, active, sort_order) VALUES (@name, @slug, @url, @description, @icon, @active, @sort_order)'
  );

  const transaction = db.transaction((projects: typeof defaultProjects) => {
    for (const project of projects) {
      insert.run(project);
    }
  });

  transaction(defaultProjects);
}

function seedAdmin(): void {
  const count = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  if (count.count > 0) {
    return;
  }

  const password = bcrypt.hashSync(env.adminPassword, 12);
  db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run(
    env.adminUsername,
    password,
    'admin'
  );
}

seedAdmin();
seedProjects();

export function getUserByUsername(username: string): UserRow | undefined {
  return db.prepare('SELECT id, username, password, role FROM users WHERE username = ?').get(username) as
    | UserRow
    | undefined;
}

export function getUserById(id: number): AuthUser | undefined {
  return db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(id) as AuthUser | undefined;
}

export function markLastLogin(id: number): void {
  db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(id);
}

export function listProjects(includeInactive = false): Project[] {
  const sql = includeInactive
    ? 'SELECT * FROM projects ORDER BY sort_order ASC, id ASC'
    : 'SELECT * FROM projects WHERE active = 1 ORDER BY sort_order ASC, id ASC';
  return db.prepare(sql).all() as Project[];
}

export function getProjectById(id: number): Project | undefined {
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project | undefined;
}

export function createProject(project: Omit<Project, 'id'>): Project {
  const statement = db.prepare(
    'INSERT INTO projects (name, slug, url, description, icon, active, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  const info = statement.run(
    project.name,
    project.slug,
    project.url,
    project.description,
    project.icon,
    project.active,
    project.sort_order
  );
  return getProjectById(Number(info.lastInsertRowid)) as Project;
}

export function updateProject(id: number, project: Partial<Omit<Project, 'id'>>): Project | undefined {
  const current = getProjectById(id);
  if (!current) {
    return undefined;
  }

  const next = { ...current, ...project };
  db.prepare(
    'UPDATE projects SET name = ?, slug = ?, url = ?, description = ?, icon = ?, active = ?, sort_order = ? WHERE id = ?'
  ).run(next.name, next.slug, next.url, next.description, next.icon, next.active, next.sort_order, id);
  return getProjectById(id);
}

export function deactivateProject(id: number): boolean {
  const info = db.prepare('UPDATE projects SET active = 0 WHERE id = ?').run(id);
  return info.changes > 0;
}
