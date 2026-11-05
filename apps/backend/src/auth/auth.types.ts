export type PrincipalKind = 'admin' | 'business' | 'driver';

export interface Principal {
  sub: string; // admin user id / business user id / driver id
  kind: PrincipalKind;
  role?: string; // AdminRole or BusinessUserRole
  businessId?: string;
  cityId?: string;
}
