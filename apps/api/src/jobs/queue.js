import PgBoss from 'pg-boss';
import { env } from '../config/env.js';

let boss;

export async function getQueue() {
  if (boss) return boss;

  boss = new PgBoss(env.DATABASE_URL);

  boss.on('error', (error) => {
    console.error('pg-boss error:', error);
  });

  await boss.start();
  return boss;
}

export async function stopQueue() {
  if (boss) {
    await boss.stop();
  }
}
