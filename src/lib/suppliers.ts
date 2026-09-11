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

/**
 * Normalizes legal name by removing all whitespace and non-alphanumeric characters,
 * then converting to lowercase.
 * Example: "Evershine Co., Ltd." -> "evershinecoltd"
 */
export function normalizeLegalName(name: string): string {
  return name.replace(/[^a-zA-Z0-9\u0100-\uFFFF]/g, "").toLowerCase().trim();
}

/**
 * Generates a city-based supplier code format: SUP-{CITY_ABBR}-{SEQUENCE:05d}
 * Example: city = "Yangon" -> "SUP-YANG-00001"
 */
export function generateSupplierCode(city: string, existingCodes: string[] = []): string {
  const cityAbbr = city.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 4) || "GEN";
  const prefix = `SUP-${cityAbbr}-`;
  
  let maxSeq = 0;
  for (const code of existingCodes) {
    if (code.startsWith(prefix)) {
      const seqStr = code.slice(prefix.length);
      const seq = parseInt(seqStr, 10);
      if (!isNaN(seq) && seq > maxSeq) {
        maxSeq = seq;
      }
    }
  }
  
  const nextSeq = maxSeq + 1;
  return `${prefix}${nextSeq.toString().padStart(5, "0")}`;
}

/**
 * Helper for half-up rounding to a given decimal precision.
 */
export function roundHalfUp(num: number, decimals: number = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round((num + Number.EPSILON) * factor) / factor;
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

/**
 * Evaluates financial formula steps supporting backward references, intermediate rounding,
 * and deposit validation (Deposit <= Sub Total).
 */
export function evaluateFinancialFormula(params: {
  basePrice: number;
  quantity: number;
  deposit: number;
  titles: FinancialTitle[];
  steps: FormulaStep[];
}): FormulaCalculationResult {
  const { basePrice, quantity, deposit, titles, steps } = params;

  if (basePrice < 0 || quantity <= 0) {
    throw new Error("Base price must be non-negative and quantity must be greater than zero.");
  }

  const total = roundHalfUp(basePrice * quantity, 2);
  let runningTotal = total;
  
  const titleMap = new Map<string, FinancialTitle>();
  for (const t of titles) {
    titleMap.set(t.id, t);
  }

  const stepResults = new Map<number, number>();
  const stepDetails: FormulaCalculationResult["stepDetails"] = [];

  // Steps must be ordered by stepNumber asc
  const sortedSteps = [...steps].sort((a, b) => a.stepNumber - b.stepNumber);

  for (const step of sortedSteps) {
    const title = titleMap.get(step.titleId);
    if (!title) {
      throw new Error(`Financial title ID ${step.titleId} not found in agreement.`);
    }

    let basisAmount = 0;
    if (step.basis === "total") {
      basisAmount = total;
    } else if (step.basis === "current_value") {
      basisAmount = runningTotal;
    } else if (step.basis.startsWith("step_")) {
      const refStepNum = parseInt(step.basis.replace("step_", ""), 10);
      if (isNaN(refStepNum) || refStepNum >= step.stepNumber) {
        throw new Error(`Invalid backward reference '${step.basis}' in step ${step.stepNumber}. Forward or self references are not allowed.`);
      }
      if (!stepResults.has(refStepNum)) {
        throw new Error(`Referenced step ${refStepNum} has not been computed yet.`);
      }
      basisAmount = stepResults.get(refStepNum)!;
    } else {
      throw new Error(`Unknown calculation basis '${step.basis}' in step ${step.stepNumber}.`);
    }

    let adjustment = 0;
    if (title.valueType === "percentage") {
      adjustment = (basisAmount * title.value) / 100;
    } else {
      adjustment = title.value;
    }

    let stepOutput = 0;
    switch (step.operator) {
      case "+":
        stepOutput = basisAmount + adjustment;
        runningTotal = runningTotal + adjustment;
        break;
      case "-":
        stepOutput = basisAmount - adjustment;
        runningTotal = runningTotal - adjustment;
        break;
      case "*":
        stepOutput = basisAmount * adjustment;
        runningTotal = runningTotal * adjustment;
        break;
      case "/":
        if (adjustment === 0) throw new Error(`Division by zero in step ${step.stepNumber}.`);
        stepOutput = basisAmount / adjustment;
        runningTotal = runningTotal / adjustment;
        break;
      default:
        throw new Error(`Unsupported operator '${step.operator}'.`);
    }

    stepOutput = roundHalfUp(stepOutput, 6);
    runningTotal = roundHalfUp(runningTotal, 6);
    stepResults.set(step.stepNumber, stepOutput);

    stepDetails.push({
      stepNumber: step.stepNumber,
      titleName: title.name,
      valueType: title.valueType,
      value: title.value,
      basisUsed: roundHalfUp(basisAmount, 2),
      adjustment: roundHalfUp(adjustment, 2),
      runningTotal: roundHalfUp(runningTotal, 2),
    });
  }

  const subTotal = roundHalfUp(runningTotal, 2);

  if (deposit > subTotal) {
    throw new Error(`Deposit amount (${deposit}) cannot exceed Sub Total (${subTotal}).`);
  }

  if (deposit < 0) {
    throw new Error("Deposit amount cannot be negative.");
  }

  const grandTotal = roundHalfUp(subTotal - deposit, 2);

  return {
    total,
    subTotal,
    deposit: roundHalfUp(deposit, 2),
    grandTotal,
    stepDetails,
  };
}

/**
 * Validates a complete Supplier Onboarding Package.
 * Enforces that Supplier details, Commercial Agreement, and Financial Formula
 * are complete and valid before requesting approval.
 */
export function validateSupplierPackage(input: SupplierPackageInput): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!input.city || input.city.trim().length < 2) {
    errors.push("City is required and must be at least 2 characters.");
  }

  if (!input.legalName || input.legalName.trim().length < 2) {
    errors.push("Legal Name is required and must be at least 2 characters.");
  }

  if (!input.contact?.name || input.contact.name.trim().length < 2) {
    errors.push("Contact Person name is required.");
  }

  if (!input.contact?.phone || input.contact.phone.trim().length < 5) {
    errors.push("Contact Person phone is required.");
  }

  if (!input.address?.addressLine || !input.address?.cityTownship || !input.address?.stateRegion || !input.address?.country) {
    errors.push("Full structured address (Address Line, City/Township, State/Region, Country) is required.");
  }

  if (!input.agreement?.currencyCode || !input.agreement?.currencyName) {
    errors.push("Agreement currency code and currency name are required.");
  }

  if (!input.agreement?.titles || input.agreement.titles.length === 0) {
    errors.push("Agreement must contain at least one Financial Title.");
  }

  if (!input.formula?.steps || input.formula.steps.length === 0) {
    errors.push("Financial Formula must contain at least one step.");
  }

  try {
    evaluateFinancialFormula({
      basePrice: input.sampleBasePrice,
      quantity: input.sampleQuantity,
      deposit: input.sampleDeposit,
      titles: input.agreement.titles,
      steps: input.formula.steps,
    });
  } catch (err: unknown) {
    if (err instanceof Error) {
      errors.push(`Financial Formula calculation error: ${err.message}`);
    } else {
      errors.push("Financial Formula calculation error.");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}