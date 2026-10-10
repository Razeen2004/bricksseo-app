import { prisma } from '../db/prisma.js';

// Reads a stored settings section (settings.<key> in the `setting` table),
// merged over the given defaults so missing/new fields still resolve.
export async function getSettingSection(key, defaults = {}) {
  const row = await prisma.setting.findUnique({ where: { key: `settings.${key}` } });
  return row ? { ...defaults, ...row.value } : defaults;
}
