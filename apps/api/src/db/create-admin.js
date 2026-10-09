import { PrismaClient } from '@prisma/client';
import argon2 from '@node-rs/argon2';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
dotenv.config();

const prisma = new PrismaClient();

async function createAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD env vars before running this script.');
    console.error('Example: ADMIN_EMAIL=you@bricksseo.com ADMIN_PASSWORD=\'a-strong-password\' npm run db:create-admin');
    process.exit(1);
  }

  const passwordHash = await argon2.hash(password);

  const user = await prisma.user.upsert({
    where: { email: email.toLowerCase() },
    update: { role: 'admin', passwordHash, mustChangePassword: false, status: 'active' },
    create: {
      email: email.toLowerCase(),
      name: 'Admin',
      role: 'admin',
      passwordHash,
      mustChangePassword: false
    }
  });

  console.log(`Admin ready: ${user.email} (role: ${user.role})`);
  await prisma.$disconnect();
}

createAdmin().catch((e) => {
  console.error(e);
  process.exit(1);
});
