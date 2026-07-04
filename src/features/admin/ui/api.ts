const ADMIN_API_ROOT = '/dev/portal/api/admin';

export function adminApiEndpoint(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${ADMIN_API_ROOT}${cleanPath}`;
}
