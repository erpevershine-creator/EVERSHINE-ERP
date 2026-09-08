export const erpRoles = [
  { code: "owner", label: "Owner" },
  { code: "admin", label: "Admin" },
  { code: "sales", label: "Sales" },
  { code: "delivery", label: "Delivery" },
  { code: "finance", label: "Finance" },
  { code: "inventory", label: "Inventory" },
] as const;
export type ErpRole = (typeof erpRoles)[number]["code"];
export function roleLabel(code: string) {
  return erpRoles.find((role) => role.code === code)?.label ?? code;
}
export function permissionLabel(module: string) {
  return module === "Positions & Permissions"
    ? "ERP Roles & Permissions"
    : module;
}
