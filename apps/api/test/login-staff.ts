import assert from 'node:assert/strict';
import type { StaffLoginInput } from '@dineflow/shared';
import type { AuthService } from '../src/auth/auth.service';

export async function loginStaff(auth: AuthService, input: StaffLoginInput) {
  const result = await auth.login(input);
  assert.ok(!('selectionRequired' in result), 'Fixture login must resolve a single restaurant');
  return result;
}
