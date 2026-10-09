import PgBoss from 'pg-boss';
import { env } from '../config/env.js';

const QUEUES = ['paddle.process_event', 'email.send'];

let boss;

export async function getQueue() {
  if (boss) return boss;

  boss = new PgBoss(env.DATABASE_URL);

  boss.on('error', (error) => {
    console.error('pg-boss error:', error);
  });

  await boss.start();

  // pg-boss v10 requires queues to exist before send()/work(); createQueue is idempotent
  for (const name of QUEUES) {
    await boss.createQueue(name);
  }

  return boss;
}

export async function stopQueue() {
  if (boss) {
    await boss.stop();
  }
}
