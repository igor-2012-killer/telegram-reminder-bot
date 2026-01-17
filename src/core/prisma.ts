import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import Database from 'better-sqlite3';
import { config } from './config';

const db = new Database(config.DATABASE_URL.replace('file:', ''));
const adapter = new PrismaBetterSqlite3(db);

export const prisma = new PrismaClient({ adapter });
