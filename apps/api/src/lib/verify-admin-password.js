import argon2 from '@node-rs/argon2';
import { AppError } from './errors.js';

export async function verifyAdminPassword(adminUser, password) {
  if (!password) {
    throw new AppError('validation_failed', 400, 'Password confirmation is required for this action');
  }
  const isValid = await argon2.verify(adminUser.passwordHash, password);
  if (!isValid) {
    throw new AppError('invalid_credentials', 401, 'Incorrect password');
  }
}
