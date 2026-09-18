export const SUPPLIER_PERMISSIONS = {
  VIEW: "supplier.read",
  CREATE: "supplier.create",
  UPDATE: "supplier.update",
  APPROVE: "supplier.approve",
  DELETE: "supplier.delete",
} as const;

export type SupplierPermission =
  (typeof SUPPLIER_PERMISSIONS)[keyof typeof SUPPLIER_PERMISSIONS];
