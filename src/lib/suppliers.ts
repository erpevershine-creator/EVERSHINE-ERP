export const SUPPLIER_CURRENCIES = [
  { code: "MMK", name: "Myanmar Kyat" },
  { code: "USD", name: "US Dollar" },
  { code: "THB", name: "Thai Baht" },
  { code: "CNY", name: "Chinese Yuan" },
  { code: "INR", name: "Indian Rupee" },
] as const;
export interface SupplierContact {
  name: string;
  phone: string;
  email?: string;
}
export interface SupplierAddress {
  addressLine: string;
  cityTownship: string;
  stateRegion: string;
  country: string;
}
export interface FinancialTitle {
  id: string;
  name: string;
  valueType: "amount" | "percentage";
  value: number;
}
export interface FormulaStep {
  stepNumber: number;
  titleId: string;
  basis: "total" | "current_value" | `step_${number}`;
  operator: "+" | "-" | "*" | "/";
}
export interface CommercialAgreement {
  currencyCode: string;
  currencyName: string;
  titles: FinancialTitle[];
}
export interface FinancialFormula {
  steps: FormulaStep[];
}
export interface SupplierPackageInput {
  city: string;
  legalName: string;
  contact: SupplierContact;
  address: SupplierAddress;
  agreement: CommercialAgreement;
  formula: FinancialFormula;
  sampleBasePrice: number;
  sampleQuantity: number;
  sampleDeposit: number;
}
export function normalizeLegalName(name: string): string {
  return name
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9\u0100-\uFFFF]/g, "")
    .toLowerCase();
}
/** Preview only: durable code allocation must happen atomically on the server. */
export function generateSupplierCode(
  city: string,
  existingCodes: string[] = [],
): string {
  const aliases: Record<string, string> = {
    yangon: "YGN",
    mandalay: "MDY",
    naypyitaw: "NPT",
  };
  const code =
    aliases[city.trim().toLowerCase()] ??
    city
      .toUpperCase()
      .replace(/[^A-Z]/g, "")
      .slice(0, 3);
  if (!/^[A-Z]{3}$/.test(code)) throw new Error("Enter a valid city.");
  const prefix = "SUP-" + code + "-";
  const sequence =
    Math.max(
      0,
      ...existingCodes
        .filter((c) => c.startsWith(prefix))
        .map((c) => Number(c.slice(prefix.length)))
        .filter(Number.isSafeInteger),
    ) + 1;
  if (sequence > 99999) throw new Error("Supplier city sequence exhausted.");
  return prefix + String(sequence).padStart(5, "0");
}
const SCALE = 1000000n;
function divide(n: bigint, d: bigint): bigint {
  if (!d) throw new Error("Division by zero.");
  const negative = n < 0n !== d < 0n;
  const a = n < 0n ? -n : n,
    b = d < 0n ? -d : d;
  const result = a / b + ((a % b) * 2n >= b ? 1n : 0n);
  return negative ? -result : result;
}
function fixed(value: number): bigint {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    Math.abs(value) > 1e12
  )
    throw new Error("Enter a finite number within the supported range.");
  const [coefficient, exponent = "0"] = String(value).toLowerCase().split("e");
  const [whole, fraction = ""] = coefficient.split(".");
  const integer = BigInt(whole + fraction);
  const shift = 6 + Number(exponent) - fraction.length;
  return shift >= 0
    ? integer * 10n ** BigInt(shift)
    : divide(integer, 10n ** BigInt(-shift));
}
function number(value: bigint): number {
  if (value > 1000000000000000000n || value < -1000000000000000000n)
    throw new Error("Calculation exceeds supported range.");
  return Number(value) / 1e6;
}
function final(value: bigint): number {
  return Number(divide(value, 10000n)) / 100;
}
export function roundHalfUp(value: number, decimals = 2): number {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 6)
    throw new Error("Invalid precision.");
  return (
    Number(divide(fixed(value), 10n ** BigInt(6 - decimals))) / 10 ** decimals
  );
}
export interface FormulaCalculationResult {
  total: number;
  subTotal: number;
  deposit: number;
  grandTotal: number;
  stepDetails: Array<{
    stepNumber: number;
    titleName: string;
    valueType: "amount" | "percentage";
    value: number;
    basisUsed: number;
    adjustment: number;
    runningTotal: number;
  }>;
}
export function evaluateFinancialFormula(params: {
  basePrice: number;
  quantity: number;
  deposit: number;
  titles: FinancialTitle[];
  steps: FormulaStep[];
}): FormulaCalculationResult {
  const base = fixed(params.basePrice),
    qty = fixed(params.quantity),
    deposit = fixed(params.deposit);
  if (base < 0n || qty <= 0n || deposit < 0n)
    throw new Error(
      "Base price and Deposit must be non-negative; quantity must be greater than zero.",
    );
  if (!Array.isArray(params.titles) || !Array.isArray(params.steps))
    throw new Error("Invalid agreement or formula.");
  const titles = new Map<string, FinancialTitle>();
  for (const t of params.titles) {
    if (
      !t ||
      typeof t.id !== "string" ||
      !t.id.trim() ||
      titles.has(t.id) ||
      typeof t.name !== "string" ||
      !t.name.trim() ||
      !["amount", "percentage"].includes(t.valueType)
    )
      throw new Error(
        "Financial titles need unique IDs, a name and a valid value type.",
      );
    fixed(t.value);
    titles.set(t.id, t);
  }
  if (params.titles.length && !params.steps.length)
    throw new Error(
      "Configure formula steps for the financial titles, or remove all titles for no adjustments.",
    );
  const total = divide(base * qty, SCALE);
  let running = total;
  const results = new Map<number, bigint>();
  const stepDetails: FormulaCalculationResult["stepDetails"] = [];
  const ordered = [...params.steps].sort((a, b) => a.stepNumber - b.stepNumber);
  for (const [index, step] of ordered.entries()) {
    if (step.stepNumber !== index + 1)
      throw new Error(
        "Formula steps must have unique consecutive sequence numbers.",
      );
    const title = titles.get(step.titleId);
    if (!title)
      throw new Error(
        `Financial title ID ${step.titleId} not found in agreement.`,
      );
    let basis: bigint;
    if (step.basis === "total") basis = total;
    else if (step.basis === "current_value") basis = running;
    else {
      const match = /^step_([1-9]\d*)$/.exec(step.basis);
      const ref = match ? Number(match[1]) : 0;
      if (!ref || ref >= step.stepNumber || !results.has(ref))
        throw new Error(
          "Forward or self references are not allowed; select an existing earlier step.",
        );
      basis = results.get(ref)!;
    }
    const value = fixed(title.value);
    const adjustment =
      title.valueType === "percentage"
        ? divide(basis * value, 100n * SCALE)
        : value;
    const apply = (amount: bigint) => {
      switch (step.operator) {
        case "+":
          return amount + adjustment;
        case "-":
          return amount - adjustment;
        case "*":
          return divide(amount * adjustment, SCALE);
        case "/":
          return divide(amount * SCALE, adjustment);
        default:
          throw new Error("Unsupported operator.");
      }
    };
    results.set(step.stepNumber, apply(basis));
    running = apply(running);
    number(running);
    stepDetails.push({
      stepNumber: step.stepNumber,
      titleName: title.name,
      valueType: title.valueType,
      value: title.value,
      basisUsed: number(basis),
      adjustment: number(adjustment),
      runningTotal: number(running),
    });
  }
  if (deposit > running)
    throw new Error(
      `Deposit amount (${params.deposit}) cannot exceed Sub Total (${number(running)}).`,
    );
  return {
    total: number(total),
    subTotal: final(running),
    deposit: final(deposit),
    grandTotal: final(running - deposit),
    stepDetails,
  };
}
export function validateSupplierPackage(input: SupplierPackageInput): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const text = (value: unknown) =>
    typeof value === "string" && value.trim().length > 0 && value.length <= 240;
  if (!text(input?.city)) errors.push("City is required.");
  if (!text(input?.legalName) || !normalizeLegalName(input.legalName))
    errors.push("Legal Name is required.");
  if (!text(input?.contact?.name))
    errors.push("Contact Person name is required.");
  if (
    !text(input?.contact?.phone) ||
    !/^\+?[0-9 ()-]{5,30}$/.test(input.contact.phone)
  )
    errors.push(
      "Contact Person phone is required and must be a valid phone number.",
    );
  if (
    input?.contact?.email &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.contact.email)
  )
    errors.push("Enter a valid contact email.");
  if (
    ![
      input?.address?.addressLine,
      input?.address?.cityTownship,
      input?.address?.stateRegion,
      input?.address?.country,
    ].every(text)
  )
    errors.push("Full structured address is required.");
  if (
    !SUPPLIER_CURRENCIES.some(
      (c) =>
        c.code === input?.agreement?.currencyCode &&
        c.name === input?.agreement?.currencyName,
    )
  )
    errors.push("Select a supported ISO currency with its matching name.");
  try {
    evaluateFinancialFormula({
      basePrice: input.sampleBasePrice,
      quantity: input.sampleQuantity,
      deposit: input.sampleDeposit,
      titles: input.agreement?.titles,
      steps: input.formula?.steps,
    });
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Invalid formula.");
  }
  return { valid: errors.length === 0, errors };
}
