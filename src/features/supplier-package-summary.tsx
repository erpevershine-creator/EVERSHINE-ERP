import {
  evaluateFinancialFormula,
  type SupplierPackageInput,
} from "@/lib/suppliers";

export function SupplierPackageSummary({
  payload,
}: {
  payload: SupplierPackageInput;
}) {
  let calculation;
  try {
    calculation = evaluateFinancialFormula({
      basePrice: payload.sampleBasePrice,
      quantity: payload.sampleQuantity,
      deposit: payload.sampleDeposit,
      titles: payload.agreement.titles,
      steps: payload.formula.steps,
    });
  } catch {
    calculation = null;
  }
  return (
    <div className="form-stack">
      <dl className="detail-grid">
        <div>
          <dt>Legal Name</dt>
          <dd>{payload.legalName || "Incomplete draft"}</dd>
        </div>
        <div>
          <dt>City / Country</dt>
          <dd>
            {payload.city} / {payload.address.country}
          </dd>
        </div>
        <div>
          <dt>Contact</dt>
          <dd>
            {payload.contact.name} · {payload.contact.phone} ·{" "}
            {payload.contact.email}
          </dd>
        </div>
        <div>
          <dt>Address</dt>
          <dd>
            {payload.address.addressLine}, {payload.address.cityTownship},{" "}
            {payload.address.stateRegion}
          </dd>
        </div>
        <div>
          <dt>Currency</dt>
          <dd>
            {payload.agreement.currencyCode} — {payload.agreement.currencyName}
          </dd>
        </div>
      </dl>
      <h4>Commercial Agreement</h4>
      {payload.agreement.titles.length ? (
        <ul>
          {payload.agreement.titles.map((t) => (
            <li key={t.id}>
              {t.name}: {t.value}{" "}
              {t.valueType === "percentage"
                ? "%"
                : payload.agreement.currencyCode}
            </li>
          ))}
        </ul>
      ) : (
        <p>No adjustments · Total = Sub Total</p>
      )}
      <h4>Financial Formula</h4>
      {payload.formula.steps.map((s) => (
        <p key={s.stepNumber}>
          Step {s.stepNumber}:{" "}
          {payload.agreement.titles.find((t) => t.id === s.titleId)?.name} ·{" "}
          {s.operator} · Basis {s.basis}
        </p>
      ))}
      <p>
        Sample: Base Price {payload.sampleBasePrice} × Quantity{" "}
        {payload.sampleQuantity} · Deposit {payload.sampleDeposit}
      </p>
      {calculation && (
        <>
          {calculation.stepDetails.map((s) => (
            <p key={s.stepNumber}>
              Step {s.stepNumber}: Basis {s.basisUsed} · Adjustment{" "}
              {s.adjustment} · Running result {s.runningTotal}
            </p>
          ))}
          <p>
            Total {calculation.total} · Sub Total{" "}
            {calculation.subTotal.toFixed(2)} · Deposit{" "}
            {calculation.deposit.toFixed(2)} · Grand Total{" "}
            {calculation.grandTotal.toFixed(2)}
          </p>
        </>
      )}
    </div>
  );
}
