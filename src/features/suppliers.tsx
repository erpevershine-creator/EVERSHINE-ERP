"use client";
import { useState, useMemo } from "react";
import { Plus, Search, Eye, AlertCircle, Calculator, Building2 } from "lucide-react";
import { PageHeading, Badge, Modal, KeyValues } from "@/components/ui";
import { DataTable, type Column } from "@/components/table";
import {
  normalizeLegalName,
  generateSupplierCode,
  evaluateFinancialFormula,
  validateSupplierPackage,
  type SupplierPackageInput,
  type FinancialTitle,
  type FormulaStep,
} from "@/lib/suppliers";
import { useReview } from "@/components/review-provider";

export interface SupplierRecord {
  id: string;
  code: string;
  legalName: string;
  normalizedLegalName: string;
  city: string;
  status: "Draft" | "Pending" | "Active" | "Archived";
  contact: { name: string; phone: string; email?: string };
  address: { addressLine: string; cityTownship: string; stateRegion: string; country: string };
  agreement: { currencyCode: string; currencyName: string; titles: FinancialTitle[] };
  formula: { steps: FormulaStep[] };
  createdAt: string;
}

const initialSuppliers: SupplierRecord[] = [
  {
    id: "sup-1",
    code: "SUP-YANG-00001",
    legalName: "Evershine Distribution Ltd.",
    normalizedLegalName: "evershinedistributionltd",
    city: "Yangon",
    status: "Active",
    contact: { name: "Daw Hla Hla", phone: "095012345", email: "contact@evershine.com" },
    address: {
      addressLine: "No. 45, Pyay Road",
      cityTownship: "Kamayut",
      stateRegion: "Yangon",
      country: "Myanmar",
    },
    agreement: {
      currencyCode: "MMK",
      currencyName: "Myanmar Kyat",
      titles: [
        { id: "disc", name: "Volume Discount", valueType: "percentage", value: 5 },
        { id: "tax", name: "Commercial Tax", valueType: "percentage", value: 5 },
      ],
    },
    formula: {
      steps: [
        { stepNumber: 1, titleId: "disc", basis: "total", operator: "-" },
        { stepNumber: 2, titleId: "tax", basis: "step_1", operator: "+" },
      ],
    },
    createdAt: new Date().toISOString(),
  },
];

export function Suppliers() {
  const { addDraft } = useReview();
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>(initialSuppliers);
  const [search, setSearch] = useState("");
  const [cityFilter, setCityFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [viewingSupplier, setViewingSupplier] = useState<SupplierRecord | null>(null);
  const [creating, setCreating] = useState(false);

  // Form state
  const [city, setCity] = useState("Yangon");
  const [legalName, setLegalName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [cityTownship, setCityTownship] = useState("");
  const [stateRegion, setStateRegion] = useState("Yangon");
  const [country] = useState("Myanmar");

  // Commercial Agreement state
  const [currencyCode, setCurrencyCode] = useState("MMK");
  const [currencyName, setCurrencyName] = useState("Myanmar Kyat");
  const [titles, setTitles] = useState<FinancialTitle[]>([
    { id: "t1", name: "Trade Discount", valueType: "percentage", value: 5 },
  ]);

  // Formula state
  const [steps, setSteps] = useState<FormulaStep[]>([
    { stepNumber: 1, titleId: "t1", basis: "total", operator: "-" },
  ]);

  // Sample calculation test state
  const [sampleBasePrice, setSampleBasePrice] = useState(10000);
  const [sampleQuantity, setSampleQuantity] = useState(10);
  const [sampleDeposit, setSampleDeposit] = useState(5000);
  const [formErrors, setFormErrors] = useState<string[]>([]);

  // Dynamic code preview based on current city
  const existingCodes = useMemo(() => suppliers.map((s) => s.code), [suppliers]);
  const previewCode = useMemo(() => generateSupplierCode(city, existingCodes), [city, existingCodes]);
  const normalizedNamePreview = useMemo(() => normalizeLegalName(legalName), [legalName]);

  // Real-time sample calculation evaluation
  const sampleCalculation = useMemo(() => {
    try {
      return {
        result: evaluateFinancialFormula({
          basePrice: sampleBasePrice,
          quantity: sampleQuantity,
          deposit: sampleDeposit,
          titles,
          steps,
        }),
        error: null,
      };
    } catch (err: unknown) {
      return {
        result: null,
        error: err instanceof Error ? err.message : "Formula error",
      };
    }
  }, [sampleBasePrice, sampleQuantity, sampleDeposit, titles, steps]);

  // Filter rows
  const filteredSuppliers = suppliers.filter((s) => {
    const matchSearch =
      s.legalName.toLowerCase().includes(search.toLowerCase()) ||
      s.code.toLowerCase().includes(search.toLowerCase()) ||
      s.contact.name.toLowerCase().includes(search.toLowerCase());
    const matchCity = cityFilter === "All" || s.city === cityFilter;
    const matchStatus = statusFilter === "All" || s.status === statusFilter;
    return matchSearch && matchCity && matchStatus;
  });

  // Columns
  const columns: Column<SupplierRecord>[] = [
    {
      key: "code",
      label: "Supplier Code",
      value: (s) => s.code,
      render: (s) => (
        <span className="record-label">
          <strong>{s.code}</strong>
          <small>{s.city}</small>
        </span>
      ),
    },
    {
      key: "legalName",
      label: "Legal Name",
      value: (s) => s.legalName,
    },
    {
      key: "contact",
      label: "Contact Person",
      value: (s) => s.contact.name,
      render: (s) => (
        <span>
          {s.contact.name} ({s.contact.phone})
        </span>
      ),
    },
    {
      key: "currency",
      label: "Currency",
      value: (s) => s.agreement.currencyCode,
    },
    {
      key: "status",
      label: "Status",
      value: (s) => s.status,
      render: (s) => <Badge>{s.status}</Badge>,
    },
    {
      key: "actions",
      label: "Actions",
      value: () => "",
      render: (s) => (
        <button
          className="button button-sm button-secondary"
          onClick={() => setViewingSupplier(s)}
          title="View Details"
        >
          <Eye size={14} /> View
        </button>
      ),
    },
  ];

  const handleAddTitle = () => {
    const newId = `t${titles.length + 1}`;
    setTitles([...titles, { id: newId, name: "New Discount", valueType: "percentage", value: 0 }]);
  };

  const handleAddStep = () => {
    const nextStepNum = steps.length + 1;
    const defaultTitle = titles[0]?.id || "";
    setSteps([...steps, { stepNumber: nextStepNum, titleId: defaultTitle, basis: "current_value", operator: "+" }]);
  };

  const handleSaveDraft = () => {
    const newSupplier: SupplierRecord = {
      id: `sup-${Date.now()}`,
      code: previewCode,
      legalName: legalName || "Untitled Supplier Draft",
      normalizedLegalName: normalizedNamePreview,
      city,
      status: "Draft",
      contact: { name: contactName, phone: contactPhone, email: contactEmail },
      address: { addressLine, cityTownship, stateRegion, country },
      agreement: { currencyCode, currencyName, titles },
      formula: { steps },
      createdAt: new Date().toISOString(),
    };
    setSuppliers([newSupplier, ...suppliers]);
    setCreating(false);
  };

  const handleSubmitApproval = () => {
    const payload: SupplierPackageInput = {
      city,
      legalName,
      contact: { name: contactName, phone: contactPhone, email: contactEmail },
      address: { addressLine, cityTownship, stateRegion, country },
      agreement: { currencyCode, currencyName, titles },
      formula: { steps },
      sampleBasePrice,
      sampleQuantity,
      sampleDeposit,
    };

    const val = validateSupplierPackage(payload);
    if (!val.valid) {
      setFormErrors(val.errors);
      return;
    }

    // Check duplicate normalized name in same city
    const isDuplicate = suppliers.some(
      (s) => s.city.toLowerCase() === city.toLowerCase() && s.normalizedLegalName === normalizedNamePreview,
    );
    if (isDuplicate) {
      setFormErrors([`A supplier with normalized legal name '${normalizedNamePreview}' already exists in ${city}.`]);
      return;
    }

    const newSupplier: SupplierRecord = {
      id: `sup-${Date.now()}`,
      code: previewCode,
      legalName,
      normalizedLegalName: normalizedNamePreview,
      city,
      status: "Pending",
      contact: { name: contactName, phone: contactPhone, email: contactEmail },
      address: { addressLine, cityTownship, stateRegion, country },
      agreement: { currencyCode, currencyName, titles },
      formula: { steps },
      createdAt: new Date().toISOString(),
    };

    setSuppliers([newSupplier, ...suppliers]);

    // Add Single Package Approval request to Approval Center
    addDraft({
      module: "Supplier Onboarding",
      title: `Onboard Supplier: ${legalName} (${previewCode})`,
      target: previewCode,
      proposed: `City: ${city}, Currency: ${currencyCode}. Single Package Approval including Contact, Commercial Agreement (${titles.length} titles) and Financial Formula (${steps.length} steps with verified Sample Calculation). Sample Grand Total: ${sampleCalculation.result ? sampleCalculation.result.grandTotal.toLocaleString() : "—"} ${currencyCode}`,
      reason: `New Supplier Onboarding for ${legalName} in ${city}`,
    });

    setCreating(false);
  };

  return (
    <div className="space-y-6">
      <PageHeading
        title="Suppliers & Commercial Formulas"
        subtitle="Manage master suppliers, country/city code sequences, commercial agreements and calculation rules."
        action={
          <button className="button button-primary" onClick={() => setCreating(true)}>
            <Plus size={16} /> Onboard New Supplier
          </button>
        }
      />

      {/* Filters bar */}
      <div className="filter-bar flex flex-wrap gap-4 items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="search-input">
            <Search size={16} />
            <input
              type="search"
              placeholder="Search by code, legal name or contact..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select value={cityFilter} onChange={(e) => setCityFilter(e.target.value)}>
            <option value="All">All Cities</option>
            <option value="Yangon">Yangon</option>
            <option value="Mandalay">Mandalay</option>
            <option value="Naypyitaw">Naypyitaw</option>
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="All">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Pending">Pending Approval</option>
            <option value="Draft">Draft</option>
          </select>
        </div>
        <div className="text-sm text-muted">
          Total: <strong>{filteredSuppliers.length}</strong> suppliers
        </div>
      </div>

      {/* Table */}
      <DataTable<SupplierRecord>
        rows={filteredSuppliers}
        columns={columns}
        name="Suppliers"
      />

      {/* Onboarding Modal */}
      {creating && (
        <Modal title="Onboard Supplier — Single Approval Package" onClose={() => setCreating(false)} wide>
          <div className="space-y-6 max-h-[75vh] overflow-y-auto pr-2">
            {formErrors.length > 0 && (
              <div className="panel bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 p-4 rounded text-sm text-red-600 dark:text-red-400">
                <div className="font-semibold flex items-center gap-2 mb-1">
                  <AlertCircle size={16} /> Package Validation Errors:
                </div>
                <ul className="list-disc pl-5 space-y-0.5">
                  {formErrors.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* 1. Basic & City Sequence */}
            <div className="border border-border p-4 rounded space-y-4">
              <h3 className="font-semibold text-base flex items-center gap-2">
                <Building2 size={18} /> 1. Supplier Basic & City Code
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="label">City (မြို့) *</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. Yangon, Mandalay"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                  />
                  <small className="text-muted block mt-1">
                    Generated Code Preview: <strong>{previewCode}</strong>
                  </small>
                </div>
                <div>
                  <label className="label">Legal Name (တရားဝင်အမည်) *</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. Evershine Co., Ltd."
                    value={legalName}
                    onChange={(e) => setLegalName(e.target.value)}
                  />
                  <small className="text-muted block mt-1">
                    Normalized: <code>{normalizedNamePreview || "—"}</code> (Duplicates blocked in same city)
                  </small>
                </div>
              </div>
            </div>

            {/* 2. Contact & Structured Address */}
            <div className="border border-border p-4 rounded space-y-4">
              <h3 className="font-semibold text-base">2. Contact Person & Structured Address</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="label">Contact Person Name *</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="U Aung Kyaw"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Phone Number *</label>
                  <input
                    type="tel"
                    className="input"
                    placeholder="09..."
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Email (Optional)</label>
                  <input
                    type="email"
                    className="input"
                    placeholder="supplier@mail.com"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-2">
                <div className="md:col-span-2">
                  <label className="label">Address Line *</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="No. 12, Main Street"
                    value={addressLine}
                    onChange={(e) => setAddressLine(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Township *</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="Hlaing"
                    value={cityTownship}
                    onChange={(e) => setCityTownship(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">State / Region *</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="Yangon"
                    value={stateRegion}
                    onChange={(e) => setStateRegion(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* 3. Commercial Agreement */}
            <div className="border border-border p-4 rounded space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-base">3. Commercial Agreement (Financial Titles)</h3>
                <button type="button" className="button button-sm button-secondary" onClick={handleAddTitle}>
                  <Plus size={14} /> Add Title
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="label">Currency Code (ISO 4217) *</label>
                  <select
                    className="input"
                    value={currencyCode}
                    onChange={(e) => {
                      setCurrencyCode(e.target.value);
                      if (e.target.value === "MMK") setCurrencyName("Myanmar Kyat");
                      if (e.target.value === "USD") setCurrencyName("US Dollar");
                      if (e.target.value === "THB") setCurrencyName("Thai Baht");
                    }}
                  >
                    <option value="MMK">MMK — Myanmar Kyat</option>
                    <option value="USD">USD — US Dollar</option>
                    <option value="THB">THB — Thai Baht</option>
                  </select>
                </div>
                <div>
                  <label className="label">Currency Name</label>
                  <input type="text" className="input" disabled value={currencyName} />
                </div>
              </div>

              <div className="space-y-3 pt-2">
                {titles.map((t, idx) => (
                  <div key={t.id} className="flex flex-wrap items-center gap-3 bg-card p-3 rounded border border-border">
                    <span className="font-semibold text-sm w-8">#{idx + 1}</span>
                    <input
                      type="text"
                      className="input flex-1 min-w-[140px]"
                      placeholder="Title Name (e.g. Trade Discount)"
                      value={t.name}
                      onChange={(e) => {
                        const next = [...titles];
                        next[idx].name = e.target.value;
                        setTitles(next);
                      }}
                    />
                    <select
                      className="input w-36"
                      value={t.valueType}
                      onChange={(e) => {
                        const next = [...titles];
                        next[idx].valueType = e.target.value as "amount" | "percentage";
                        setTitles(next);
                      }}
                    >
                      <option value="percentage">Percentage (%)</option>
                      <option value="amount">Amount ({currencyCode})</option>
                    </select>
                    <input
                      type="number"
                      className="input w-28"
                      placeholder="Value"
                      value={t.value}
                      onChange={(e) => {
                        const next = [...titles];
                        next[idx].value = parseFloat(e.target.value) || 0;
                        setTitles(next);
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* 4. Financial Formula & Real-time Sample Calculation */}
            <div className="border border-border p-4 rounded space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-base flex items-center gap-2">
                  <Calculator size={18} /> 4. Financial Formula & Sample Calculation
                </h3>
                <button type="button" className="button button-sm button-secondary" onClick={handleAddStep}>
                  <Plus size={14} /> Add Step
                </button>
              </div>

              <div className="space-y-3">
                {steps.map((step, idx) => (
                  <div key={step.stepNumber} className="flex flex-wrap items-center gap-3 bg-card p-3 rounded border border-border">
                    <span className="font-semibold text-sm">Step {step.stepNumber}</span>
                    <select
                      className="input min-w-[140px]"
                      value={step.titleId}
                      onChange={(e) => {
                        const next = [...steps];
                        next[idx].titleId = e.target.value;
                        setSteps(next);
                      }}
                    >
                      {titles.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.value}{t.valueType === "percentage" ? "%" : ""})
                        </option>
                      ))}
                    </select>
                    <select
                      className="input w-24"
                      value={step.operator}
                      onChange={(e) => {
                        const next = [...steps];
                        next[idx].operator = e.target.value as "+" | "-" | "*" | "/";
                        setSteps(next);
                      }}
                    >
                      <option value="+">+</option>
                      <option value="-">-</option>
                      <option value="*">*</option>
                      <option value="/">/</option>
                    </select>
                    <select
                      className="input min-w-[160px]"
                      value={step.basis}
                      onChange={(e) => {
                        const next = [...steps];
                        next[idx].basis = e.target.value as FormulaStep["basis"];
                        setSteps(next);
                      }}
                    >
                      <option value="total">Base Total</option>
                      <option value="current_value">Current Running Total</option>
                      {steps.slice(0, idx).map((prev) => (
                        <option key={prev.stepNumber} value={`step_${prev.stepNumber}`}>
                          Backward: Step {prev.stepNumber} Result
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {/* Live Calculator Simulation */}
              <div className="bg-muted/40 p-4 rounded space-y-3 border border-border">
                <div className="font-semibold text-sm">Interactive Sample Calculation (Preview Test)</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-muted block mb-1">Sample Base Price</label>
                    <input
                      type="number"
                      className="input input-sm"
                      value={sampleBasePrice}
                      onChange={(e) => setSampleBasePrice(parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted block mb-1">Sample Quantity</label>
                    <input
                      type="number"
                      className="input input-sm"
                      value={sampleQuantity}
                      onChange={(e) => setSampleQuantity(parseFloat(e.target.value) || 1)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted block mb-1">Sample Prepayment Deposit</label>
                    <input
                      type="number"
                      className="input input-sm"
                      value={sampleDeposit}
                      onChange={(e) => setSampleDeposit(parseFloat(e.target.value) || 0)}
                    />
                  </div>
                </div>

                {sampleCalculation.error ? (
                  <div className="text-xs text-red-500 font-medium">⚠️ {sampleCalculation.error}</div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-2 text-sm border-t border-border">
                    <div>
                      Base Total: <strong>{sampleCalculation.result?.total.toLocaleString()} {currencyCode}</strong>
                    </div>
                    <div>
                      Sub Total: <strong>{sampleCalculation.result?.subTotal.toLocaleString()} {currencyCode}</strong>
                    </div>
                    <div>
                      Deposit: <strong>{sampleCalculation.result?.deposit.toLocaleString()} {currencyCode}</strong>
                    </div>
                    <div className="text-primary font-bold">
                      Grand Total: <strong>{sampleCalculation.result?.grandTotal.toLocaleString()} {currencyCode}</strong>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
              <button type="button" className="button button-secondary" onClick={() => setCreating(false)}>
                Cancel
              </button>
              <button type="button" className="button button-secondary" onClick={handleSaveDraft}>
                Save as Draft
              </button>
              <button type="button" className="button button-primary" onClick={handleSubmitApproval}>
                Submit for Approval
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Supplier View Modal */}
      {viewingSupplier && (
        <Modal title={`Supplier: ${viewingSupplier.legalName}`} onClose={() => setViewingSupplier(null)} wide>
          <div className="space-y-6 max-h-[75vh] overflow-y-auto">
            <KeyValues
              rows={[
                ["Supplier Code", viewingSupplier.code],
                ["Legal Name", viewingSupplier.legalName],
                ["Normalized Name", viewingSupplier.normalizedLegalName],
                ["City", viewingSupplier.city],
                ["Status", <Badge key="s">{viewingSupplier.status}</Badge>],
                ["Contact Person", `${viewingSupplier.contact.name} (${viewingSupplier.contact.phone})`],
                [
                  "Address",
                  `${viewingSupplier.address.addressLine}, ${viewingSupplier.address.cityTownship}, ${viewingSupplier.address.stateRegion}, ${viewingSupplier.address.country}`,
                ],
                ["Currency", `${viewingSupplier.agreement.currencyCode} — ${viewingSupplier.agreement.currencyName}`],
              ]}
            />

            <div className="border-t border-border pt-4">
              <h4 className="font-semibold text-sm mb-2">Commercial Agreement Titles</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {viewingSupplier.agreement.titles.map((t) => (
                  <div key={t.id} className="p-2 border border-border rounded text-sm flex justify-between">
                    <span>{t.name}</span>
                    <strong>
                      {t.value} {t.valueType === "percentage" ? "%" : viewingSupplier.agreement.currencyCode}
                    </strong>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <h4 className="font-semibold text-sm mb-2">Financial Formula Steps</h4>
              <div className="space-y-1 text-sm">
                {viewingSupplier.formula.steps.map((st) => (
                  <div key={st.stepNumber} className="p-2 bg-muted/30 rounded border border-border flex gap-4">
                    <span>Step {st.stepNumber}</span>
                    <span>Operator: <strong>{st.operator}</strong></span>
                    <span>Basis: <strong>{st.basis}</strong></span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}