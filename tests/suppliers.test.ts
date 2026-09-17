import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeLegalName,
  generateSupplierCode,
  evaluateFinancialFormula,
  validateSupplierPackage,
} from "../src/lib/suppliers.ts";

test("normalizeLegalName removes special characters, whitespace and converts to lowercase", () => {
  assert.equal(normalizeLegalName("Evershine Co., Ltd."), "evershinecoltd");
  assert.equal(normalizeLegalName("  evershine   coltd  "), "evershinecoltd");
  assert.equal(normalizeLegalName("ABC-Trading & Supply!"), "abctradingsupply");
  assert.equal(normalizeLegalName("ရွှေလမင်း ကုမ္ပဏီလီမိတက်"), "ရွှေလမင်းကုမ္ပဏီလီမိတက်");
});

test("generateSupplierCode creates sequence per city correctly", () => {
  const ygn1 = generateSupplierCode("Yangon", []);
  assert.equal(ygn1, "SUP-YGN-00001");

  const ygn2 = generateSupplierCode("Yangon", ["SUP-YGN-00001", "SUP-YGN-00002"]);
  assert.equal(ygn2, "SUP-YGN-00003");

  const mdy1 = generateSupplierCode("Mandalay", ["SUP-YGN-00001", "SUP-YGN-00002"]);
  assert.equal(mdy1, "SUP-MDY-00001");

  const mdy2 = generateSupplierCode("Mandalay", ["SUP-MDY-00005"]);
  assert.equal(mdy2, "SUP-MDY-00006");
});

test("evaluateFinancialFormula computes steps with backward references and checks deposit bounds", () => {
  const titles = [
    { id: "disc", name: "Discount", valueType: "percentage" as const, value: 10 },
    { id: "tax", name: "Commercial Tax", valueType: "percentage" as const, value: 5 },
    { id: "fee", name: "Delivery Fee", valueType: "amount" as const, value: 2000 },
  ];

  // Step 1: Discount 10% on Total
  // Step 2: Delivery Fee (+ 2000 on current_value)
  // Step 3: Tax 5% based on Step 1 output (backward reference)
  const steps = [
    { stepNumber: 1, titleId: "disc", basis: "total" as const, operator: "-" as const },
    { stepNumber: 2, titleId: "fee", basis: "current_value" as const, operator: "+" as const },
    { stepNumber: 3, titleId: "tax", basis: "step_1" as const, operator: "+" as const },
  ];

  // Base price 1000, Qty 100 -> Total = 100,000
  // Step 1: 100,000 - 10% (10,000) = 90,000 (running: 90,000)
  // Step 2: 90,000 + 2,000 = 92,000 (running: 92,000)
  // Step 3: Step 1 output is 90,000. 5% of 90,000 = 4,500. runningTotal = 92,000 + 4,500 = 96,500
  // Sub Total = 96,500
  // Deposit = 10,000 -> Grand Total = 86,500
  const res = evaluateFinancialFormula({
    basePrice: 1000,
    quantity: 100,
    deposit: 10000,
    titles,
    steps,
  });

  assert.equal(res.total, 100000);
  assert.equal(res.subTotal, 96500);
  assert.equal(res.deposit, 10000);
  assert.equal(res.grandTotal, 86500);
  assert.equal(res.stepDetails.length, 3);
  assert.equal(res.stepDetails[2].adjustment, 4500);
});

test("evaluateFinancialFormula rejects forward reference and deposit exceeding subtotal", () => {
  const titles = [
    { id: "disc", name: "Discount", valueType: "percentage" as const, value: 10 },
    { id: "fee", name: "Fee", valueType: "amount" as const, value: 2000 },
  ];

  // Step 1 attempting forward reference to step_2
  const invalidSteps = [
    { stepNumber: 1, titleId: "disc", basis: "step_2" as const, operator: "-" as const },
    { stepNumber: 2, titleId: "fee", basis: "current_value" as const, operator: "+" as const },
  ];

  assert.throws(() => {
    evaluateFinancialFormula({
      basePrice: 1000,
      quantity: 10,
      deposit: 0,
      titles,
      steps: invalidSteps,
    });
  }, /Forward or self references are not allowed/);

  // Valid steps, but Deposit > Subtotal
  const validSteps = [
    { stepNumber: 1, titleId: "disc", basis: "total" as const, operator: "-" as const },
  ];

  assert.throws(() => {
    evaluateFinancialFormula({
      basePrice: 100,
      quantity: 10, // Total = 1000, SubTotal = 900
      deposit: 1200, // Exceeds 900
      titles,
      steps: validSteps,
    });
  }, /Deposit amount \(1200\) cannot exceed Sub Total \(900\)/);
});

test("validateSupplierPackage checks required fields across supplier, agreement and formula", () => {
  const validPackage = {
    city: "Yangon",
    legalName: "Evershine Global Ltd.",
    contact: { name: "U Ba", phone: "0912345678" },
    address: {
      addressLine: "No. 123, Merchant Road",
      cityTownship: "Kyauktada",
      stateRegion: "Yangon",
      country: "Myanmar",
    },
    agreement: {
      currencyCode: "MMK",
      currencyName: "Myanmar Kyat",
      titles: [{ id: "t1", name: "Standard Discount", valueType: "percentage" as const, value: 5 }],
    },
    formula: {
      steps: [{ stepNumber: 1, titleId: "t1", basis: "total" as const, operator: "-" as const }],
    },
    sampleBasePrice: 1000,
    sampleQuantity: 10,
    sampleDeposit: 500,
  };

  const res = validateSupplierPackage(validPackage);
  assert.equal(res.valid, true);
  assert.equal(res.errors.length, 0);

  // Missing contact phone & deposit too high
  const invalidPackage = {
    ...validPackage,
    contact: { name: "U Ba", phone: "" },
    sampleDeposit: 50000,
  };
  const invalidRes = validateSupplierPackage(invalidPackage);
  assert.equal(invalidRes.valid, false);
  assert.ok(invalidRes.errors.some((e) => e.includes("Contact Person phone is required")));
  assert.ok(invalidRes.errors.some((e) => e.includes("cannot exceed Sub Total")));
});
test("no-adjustment package computes Total = Sub Total and subtracts deposit", () => {
  const result = evaluateFinancialFormula({basePrice:100,quantity:3,deposit:50,titles:[],steps:[]});
  assert.equal(result.total,300);
  assert.equal(result.subTotal,300);
  assert.equal(result.grandTotal,250);
});
test("six-decimal internals survive until final rounding", () => {
  const result = evaluateFinancialFormula({basePrice:0.014,quantity:1,deposit:0,titles:[{id:"t",name:"Fee",valueType:"amount",value:0.004}],steps:[{stepNumber:1,titleId:"t",basis:"total",operator:"+"}]});
  assert.equal(result.total,0.014);
  assert.equal(result.subTotal,0.02);
  assert.equal(result.stepDetails[0].runningTotal,0.018);
});
test("nonfinite numbers and duplicate sequence identities are rejected", () => {
  for (const bad of [NaN,Infinity,-Infinity]) assert.throws(()=>evaluateFinancialFormula({basePrice:bad,quantity:1,deposit:0,titles:[],steps:[]}));
  assert.throws(()=>evaluateFinancialFormula({basePrice:100,quantity:1,deposit:0,titles:[{id:"t",name:"Fee",valueType:"amount",value:1}],steps:[{stepNumber:2,titleId:"t",basis:"total",operator:"+"}]}));
});
test("CNY and INR no-adjustment packages validate; mismatched currency names fail", () => {
  for (const [currencyCode,currencyName] of [["CNY","Chinese Yuan"],["INR","Indian Rupee"]]) {
    const input={city:"Yangon",legalName:"Supplier",contact:{name:"U Ba",phone:"0912345678"},address:{addressLine:"Main Road",cityTownship:"Hlaing",stateRegion:"Yangon",country:"Myanmar"},agreement:{currencyCode,currencyName,titles:[]},formula:{steps:[]},sampleBasePrice:100,sampleQuantity:1,sampleDeposit:0};
    assert.equal(validateSupplierPackage(input).valid,true);
    assert.equal(validateSupplierPackage({...input,agreement:{...input.agreement,currencyName:"Wrong"}}).valid,false);
    assert.equal(validateSupplierPackage({...input,address:{...input.address,addressLine:" "}}).valid,false);
  }
});
