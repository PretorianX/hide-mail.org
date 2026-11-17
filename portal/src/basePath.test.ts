import { PORTAL_BASE_PATH } from '@/basePath';

describe('PORTAL_BASE_PATH', () => {
  it('is the /admin/portal prefix used by Vite base and the router', () => {
    expect(PORTAL_BASE_PATH).toBe('/admin/portal');
    expect(`${PORTAL_BASE_PATH}/`).toBe('/admin/portal/');
  });
});
