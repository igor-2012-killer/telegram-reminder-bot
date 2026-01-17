import { PrismaClient } from '@prisma/client';
import { PrismaBetterSQLite3 } from '@prisma/adapter-better-sqlite3';
import { config } from './config';

const adapter = new PrismaBetterSQLite3({
    url: config.DATABASE_URL
});

export const prisma = new PrismaClient({ adapter });
