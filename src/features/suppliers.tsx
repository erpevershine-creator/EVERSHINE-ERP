"use client";
import { useState, useMemo, useRef, type ChangeEvent } from "react";
import { Plus, Search, Eye, Edit, Trash2, AlertCircle, Calculator, Building2, Download, Upload, Printer, FileSpreadsheet, CheckCircle2 } from "lucide-react";
import { PageHeading, Badge, Modal, KeyValues } from "@/components/ui";
import { DataTable, type Column } from "@/components/table";
import { csvCell } from "@/lib/policy";
import {
  SUPPLIER_CURRENCIES,
  normalizeLegalName,
  generateSupplierCode,
  evaluateFinancialFormula,
  validateSupplierPackage,
  type SupplierPackageInput,
  type FinancialTitle,
  type FormulaStep,
} from "@/lib/suppliers";
import { getSuppliers, saveSupplier, decideSupplier } from "@/app/suppliers/actions";
import type { Access } from "@/lib/access";
import { SupplierPackageSummary } from "./supplier-package-summary";

export interface SupplierRevision {
  id: string; supplier_id:string; revision:number; payload:SupplierPackageInput;
  status:string; reason:string; request_id:number|null; created_by:string; created_at:string;
}

export interface SupplierRecord {
  id: string;
  code: string;
  legalName: string;
  normalizedLegalName: string;
  city: string;
  status: "Draft" | "Pending" | "Active" | "Archived" | "Rejected";
  contact: { name: string; phone: string; email?: string };
  address: { addressLine: string; cityTownship: string; stateRegion: string; country: string };
  agreement: { currencyCode: string; currencyName: string; titles: FinancialTitle[] };
  formula: { steps: FormulaStep[] };
  createdAt: string;
  version?: number;
  history?: SupplierRevision[];
  createdBy?: string;
}

const supplierCsvHeaders = [
  "code",
  "legalName",
  "city",
  "status",
  "contactName",
  "contactPhone",
  "contactEmail",
  "addressLine",
  "cityTownship",
  "stateRegion",
  "country",
  "currencyCode",
  "currencyName",
  "titles",
  "formulaSteps",
  "createdAt",
] as const;

function downloadTextFile(filename: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const input = text.replace(/^\uFEFF/, "");
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
    } else if (character === '"' && cell.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n") {
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else if (character !== "\r") {
      cell += character;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    if (row.some((value) => value.trim())) rows.push(row);
  }
  return rows;
}

function supplierCsvRow(supplier: SupplierRecord) {
  return [
    supplier.code,
    supplier.legalName,
    supplier.city,
    supplier.status,
    supplier.contact.name,
    supplier.contact.phone,
    supplier.contact.email ?? "",
    supplier.address.addressLine,
    supplier.address.cityTownship,
    supplier.address.stateRegion,
    supplier.address.country,
    supplier.agreement.currencyCode,
    supplier.agreement.currencyName,
    JSON.stringify(supplier.agreement.titles),
    JSON.stringify(supplier.formula.steps),
    supplier.createdAt,
  ];
}

export function Suppliers({initialRecords,access}:{initialRecords:SupplierRecord[];access:Access}) {
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>(initialRecords);
  const [previousRecords,setPreviousRecords]=useState(initialRecords);
  if(previousRecords!==initialRecords){setPreviousRecords(initialRecords);setSuppliers(initialRecords);}
  const can=(action:string)=>access.role==="owner" || access.actions["Suppliers & Commercials"]?.some(a=>a===action||a==="*");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [reason,setReason]=useState("");
  const [expected,setExpected]=useState(0);
  const command=useRef<{fingerprint:string;token:string}|null>(null);
  const [search, setSearch] = useState("");
  const [cityFilter, setCityFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [viewingSupplier, setViewingSupplier] = useState<SupplierRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingCode, setEditingCode] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ count: number; errors: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Form state
  const [city, setCity] = useState("Yangon");
  const [legalName, setLegalName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [cityTownship, setCityTownship] = useState("");
  const [stateRegion, setStateRegion] = useState("Yangon");
  const [country, setCountry] = useState("Myanmar");

  // Commercial Agreement state
  const [currencyCode, setCurrencyCode] = useState("MMK");
  const [currencyName, setCurrencyName] = useState("Myanmar Kyat");
  const [titles, setTitles] = useState<FinancialTitle[]>([

  ]);

  // Formula state
  const [steps, setSteps] = useState<FormulaStep[]>([

  ]);

  // Sample calculation test state
  const [sampleBasePrice, setSampleBasePrice] = useState(10000);
  const [sampleQuantity, setSampleQuantity] = useState(10);
  const [sampleDeposit, setSampleDeposit] = useState(5000);
  const [formErrors, setFormErrors] = useState<string[]>([]);

  // Dynamic code preview based on current city
  const existingCodes = useMemo(() => suppliers.map((s) => s.code), [suppliers]);
  const previewCode = useMemo(() => {try {return generateSupplierCode(city, existingCodes);} catch {return "Select a city";}}, [city, existingCodes]);


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
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          <button className="button" onClick={() => setViewingSupplier(s)} title="View Details">
            <Eye size={14} /> View
          </button>
          <button className="button" disabled={!can("edit") || s.history?.[0]?.status==="pending"} onClick={() => openEditForm(s)} title="Edit Supplier">
            <Edit size={14} /> Edit
          </button>

        </div>
      ),
    },
  ];

  const handleAddTitle = () => {
    let nextId = titles.length + 1;
    while (titles.some((title) => title.id === `t${nextId}`)) nextId += 1;
    const newId = `t${nextId}`;
    setTitles([...titles, { id: newId, name: "New Title", valueType: "percentage", value: 0 }]);
  };

  const handleDeleteTitle = (titleId: string) => {
    if (steps.some((step) => step.titleId === titleId)) {
      setFormErrors(["Remove this title from all formula steps before deleting it."]);
      return;
    }
    setTitles((current) => current.filter((title) => title.id !== titleId));
  };

  const handleAddStep = () => {
    if (!titles.length) {setFormErrors(["Add a Financial Title first, or keep zero steps for no adjustments."]);return;}
    const nextStepNum = steps.length + 1;
    const defaultTitle = titles[0]?.id || "";
    setSteps([...steps, { stepNumber: nextStepNum, titleId: defaultTitle, basis: "current_value", operator: "+" }]);
  };

  const handleDeleteStep = (stepNumber: number) => {
    if (steps.some(step=>step.basis === `step_${stepNumber}`)) {setFormErrors(["Update dependent steps before deleting this step."]);return;}
    const deletedStep = steps.find((step) => step.stepNumber === stepNumber);
    if (!deletedStep) return;
    const nextSteps = steps
      .filter((step) => step.stepNumber !== stepNumber)
      .map((step, index) => {
        const nextNumber = index + 1;
        let basis = step.basis;
        if (basis === `step_${stepNumber}`) basis = "current_value";
        else if (basis.startsWith("step_")) {
          const referenced = Number(basis.slice(5));
          if (referenced > stepNumber) basis = `step_${referenced - 1}`;
        }
        return { ...step, stepNumber: nextNumber, basis };
      });
    setSteps(nextSteps);
  };

  const moveStep=(index:number,direction:number)=>{
    const ordered=[...steps];const target=index+direction;
    if(target<0||target>=ordered.length)return;
    [ordered[index],ordered[target]]=[ordered[target],ordered[index]];
    const numbers=new Map(ordered.map((step,i)=>[step.stepNumber,i+1]));
    const next=ordered.map((step,i)=>({...step,stepNumber:i+1,basis:step.basis.startsWith("step_") ? `step_${numbers.get(Number(step.basis.slice(5)))}` as FormulaStep["basis"] : step.basis}));
    if(next.some(step=>step.basis.startsWith("step_") && Number(step.basis.slice(5))>=step.stepNumber)){setFormErrors(["This move would create a forward reference. Change the dependent Basis first."]);return;}
    setSteps(next);setFormErrors([]);
  };

  const resetForm = () => {
    setCity("Yangon");
    setLegalName("");
    setContactName("");
    setContactPhone("");
    setContactEmail("");
    setAddressLine("");
    setCityTownship("");
    setStateRegion("Yangon");
    setCountry("Myanmar");
    setCurrencyCode("MMK");
    setCurrencyName("Myanmar Kyat");
    setTitles([]);
    setSteps([]);
    setSampleBasePrice(10000);
    setSampleQuantity(10);
    setSampleDeposit(5000);
    setFormErrors([]);
    setEditingId(null);
    setEditingCode("");
    setReason(""); setExpected(0); command.current=null;
  };

  const openNewSupplierForm = () => {
    resetForm();
    setCreating(true);
  };

  const openEditForm = (record: SupplierRecord) => {
    const latest=record.history?.[0];
    if (latest?.status === "pending") return;
    const supplier={...record,...latest?.payload};
    setExpected(record.version ?? 0); setReason(""); command.current=null;
    setSampleBasePrice(latest?.payload.sampleBasePrice ?? 10000);
    setSampleQuantity(latest?.payload.sampleQuantity ?? 1);
    setSampleDeposit(latest?.payload.sampleDeposit ?? 0);
    setCity(supplier.city);
    setLegalName(supplier.legalName);
    setContactName(supplier.contact.name);
    setContactPhone(supplier.contact.phone);
    setContactEmail(supplier.contact.email ?? "");
    setAddressLine(supplier.address.addressLine);
    setCityTownship(supplier.address.cityTownship);
    setStateRegion(supplier.address.stateRegion);
    setCountry(supplier.address.country);
    setCurrencyCode(supplier.agreement.currencyCode);
    setCurrencyName(supplier.agreement.currencyName);
    setTitles(supplier.agreement.titles.map((title) => ({ ...title })));
    setSteps(supplier.formula.steps.map((step) => ({ ...step })));
    setFormErrors([]);
    setEditingId(supplier.id);
    setEditingCode(supplier.code);
    setViewingSupplier(null);
    setCreating(true);
  };

  const closeForm = () => {
    setCreating(false);
    resetForm();
  };

  const save = async (submit: boolean) => {
    if (busy) return;
    const payload: SupplierPackageInput = {city,legalName,contact:{name:contactName,phone:contactPhone,email:contactEmail},address:{addressLine,cityTownship,stateRegion,country},agreement:{currencyCode,currencyName,titles},formula:{steps},sampleBasePrice,sampleQuantity,sampleDeposit};
    const input={id:editingId,expected,payload,reason,submit};
    const fingerprint=JSON.stringify(input);
    if (command.current?.fingerprint!==fingerprint) command.current={fingerprint,token:crypto.randomUUID()};
    setBusy(true); setFormErrors([]);
    try {
      const result=await saveSupplier({...input,token:command.current.token});
      if (result.error) {setFormErrors([result.error]);return;}
      closeForm();
      setMessage(submit ? 'Supplier package submitted to Approval Center.' : 'Supplier draft saved.');
      setSuppliers(await getSuppliers());
    } catch {setFormErrors(['Connection interrupted. Retry with the same form to recover the saved result.']);}
    finally {setBusy(false);}
  };
  const handleSaveDraft = () => void save(false);
  const handleSubmitApproval = () => void save(true);

  const handleExport = () => {
    const csv = "\uFEFF" + [
      supplierCsvHeaders.map((header) => csvCell(header)).join(","),
      ...filteredSuppliers.map((supplier) => supplierCsvRow(supplier).map(csvCell).join(",")),
    ].join("\r\n");
    downloadTextFile("evershine-suppliers.csv", csv, "text/csv;charset=utf-8");
  };

  const handleDownloadTemplate = () => {
    const example: SupplierRecord = {
      id: "template",
      code: "",
      legalName: "Example Supplier Ltd.",
      normalizedLegalName: "examplesupplierltd",
      city: "Yangon",
      status: "Draft",
      contact: { name: "Contact Person", phone: "0912345678", email: "supplier@example.com" },
      address: { addressLine: "No. 1 Main Street", cityTownship: "Kamayut", stateRegion: "Yangon", country: "Myanmar" },
      agreement: { currencyCode: "MMK", currencyName: "Myanmar Kyat", titles: [{ id: "title-1", name: "Trade Discount", valueType: "percentage", value: 5 }] },
      formula: { steps: [{ stepNumber: 1, titleId: "title-1", basis: "total", operator: "-" }] },
      createdAt: new Date().toISOString(),
    };
    const csv = "\uFEFF" + [
      supplierCsvHeaders.map((header) => csvCell(header)).join(","),
      supplierCsvRow(example).map(csvCell).join(","),
    ].join("\r\n");
    downloadTextFile("evershine-suppliers-template.csv", csv, "text/csv;charset=utf-8");
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!can("create") || !can("import")) return;
    if (file.size > 1048576) {setImportResult({count:0,errors:["Select a CSV smaller than 1 MB."]});return;}
    const importReason=window.prompt("Reason for importing Supplier drafts");
    if (!importReason?.trim()) return;
    setImporting(true);
    setImportResult(null);
    const errors: string[] = [];
    let imported: SupplierRecord[] = [];
    const importedNames = new Set<string>();
    const importedCodes = new Set<string>();
    try {
      const rows = parseCsv(await file.text());
      if (rows.length < 2) throw new Error("The CSV contains no supplier rows.");
      const headers = rows[0].map((header) => header.trim());
      const indexes = new Map(headers.map((header, index) => [header, index]));
      const missing = ["legalName", "city", "contactName", "contactPhone", "addressLine", "cityTownship", "stateRegion", "country", "currencyCode", "currencyName", "titles", "formulaSteps"]
        .filter((header) => !indexes.has(header));
      if (missing.length) throw new Error(`Missing required columns: ${missing.join(", ")}.`);
      imported = rows.slice(1).flatMap((row, index) => {
        const line = index + 2;
        const get = (key: string) => row[indexes.get(key) ?? -1]?.trim() ?? "";
        try {
          const legalName = get("legalName");
          const city = get("city");
          const titles = JSON.parse(get("titles")) as FinancialTitle[];
          const formulaSteps = JSON.parse(get("formulaSteps")) as FormulaStep[];
          const input: SupplierPackageInput = {
            city,
            legalName,
            contact: { name: get("contactName"), phone: get("contactPhone"), email: get("contactEmail") || undefined },
            address: { addressLine: get("addressLine"), cityTownship: get("cityTownship"), stateRegion: get("stateRegion"), country: get("country") },
            agreement: { currencyCode: get("currencyCode"), currencyName: get("currencyName"), titles },
            formula: { steps: formulaSteps },
            sampleBasePrice: 10000,
            sampleQuantity: 1,
            sampleDeposit: 0,
          };
          const validation = validateSupplierPackage(input);
          if (!validation.valid) throw new Error(validation.errors.join(" "));
          const normalizedName = normalizeLegalName(legalName);
          const duplicateKey = `${city.toLowerCase()}::${normalizedName}`;
          if (suppliers.some((supplier) => `${supplier.city.toLowerCase()}::${supplier.normalizedLegalName}` === duplicateKey) || importedNames.has(duplicateKey)) {
            throw new Error(`A supplier with normalized legal name '${normalizedName}' already exists in ${city}.`);
          }
          importedNames.add(duplicateKey);
          const existingCodes = [...suppliers, ...imported].map((supplier) => supplier.code);
          if (get("code")) throw new Error("Leave code empty; the server assigns the permanent city sequence.");
          const code = generateSupplierCode(city, [...existingCodes, ...importedCodes]);
          if (existingCodes.includes(code) || importedCodes.has(code)) throw new Error(`Supplier code '${code}' is already in use.`);
          importedCodes.add(code);
          return [{
            id: `sup-${Date.now()}-${line}`,
            code,
            legalName,
            normalizedLegalName: normalizedName,
            city,
            status: "Draft" as const,
            contact: input.contact,
            address: input.address,
            agreement: input.agreement,
            formula: input.formula,
            createdAt: get("createdAt") || new Date().toISOString(),
          }];
        } catch (error: unknown) {
          errors.push(`Row ${line}: ${error instanceof Error ? error.message : "Invalid row."}`);
          return [];
        }
      });
      const candidates=imported;
      imported=[];
      for (const row of candidates) {
        const payload:SupplierPackageInput={...row,sampleBasePrice:10000,sampleQuantity:1,sampleDeposit:0};
        const result=await saveSupplier({id:null,expected:0,payload,reason:importReason,submit:false,token:crypto.randomUUID()});
        if (result.error) errors.push(`${row.legalName}: ${result.error}`);
        else imported.push(row);
      }
      setSuppliers(await getSuppliers());
    } catch (error: unknown) {
      errors.push(error instanceof Error ? error.message : "Could not import CSV.");
    } finally {
      setImporting(false);
      setImportResult({ count: imported.length, errors });
    }
  };

  return (
    <div>
      <PageHeading
        title="Suppliers & Commercial Formulas"
        subtitle="Suppliers, commercial agreements and approved calculation formulas."
        action={
          <button className="primary" disabled={!can("create")} onClick={openNewSupplierForm}>
            <Plus size={16} /> New Supplier Form
          </button>
        }
      />

      {message && <p role="status">{message}</p>}
      <div className="table-toolbar">
        <div className="search-box">
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
        <div className="toolbar-spacer" />
        <button type="button" onClick={handleDownloadTemplate} title="Download CSV import template">
          <FileSpreadsheet size={15} /> Template
        </button>
        <button type="button" disabled={!can("create") || !can("import") || importing} onClick={() => fileInputRef.current?.click()} title="Import suppliers from CSV">
          <Upload size={15} /> {importing ? "Importing…" : "Import CSV"}
        </button>
        <button type="button" disabled={!can("export")} onClick={handleExport} title="Export the filtered suppliers as CSV">
          <Download size={15} /> Export CSV
        </button>
        <button type="button" disabled={!can("export")} onClick={() => window.print()} title="Print or save this page as PDF">
          <Printer size={15} /> PDF / Print
        </button>
        <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={handleImport} hidden />
        <div className="muted" style={{ fontSize: "11px" }}>
          Total: <strong>{filteredSuppliers.length}</strong> suppliers
        </div>
      </div>

      <DataTable<SupplierRecord>
        rows={filteredSuppliers}
        columns={columns}
        name="Suppliers" sample={false} exportAllowed={!!can("export")}
      />

      {importResult && (
        <Modal title="Supplier CSV Import" onClose={() => setImportResult(null)}>
          <div className="form-stack">
            <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--positive)" }}>
              <CheckCircle2 size={18} />
              <strong>{importResult.count} supplier{importResult.count === 1 ? "" : "s"} imported as draft{importResult.count === 1 ? "" : "s"}.</strong>
            </div>
            {importResult.errors.length > 0 && (
              <div className="panel" style={{ background: "var(--negative-bg)", borderColor: "var(--negative)", color: "var(--negative)", padding: "12px 16px", fontSize: "12px" }}>
                <strong>Rows needing attention</strong>
                <ul style={{ paddingLeft: "20px", margin: "6px 0 0" }}>
                  {importResult.errors.map((error) => <li key={error}>{error}</li>)}
                </ul>
              </div>
            )}
            <div className="form-actions">
              <button type="button" onClick={() => setImportResult(null)}>Close</button>
            </div>
          </div>
        </Modal>
      )}

      {creating && (
        <Modal title={editingId ? `Edit Supplier — ${editingCode}` : "New Supplier Form"} onClose={() => {if(!busy) closeForm();}} wide>
          <div className="supplier-form">
          <div className="supplier-form-content" inert={busy}>
            <div className="supplier-form-intro">
              <span>Supplier details, commercial agreement and calculation formula</span>
              <span>{editingCode || previewCode} · {editingId ? "Revision" : "Assigned on save"}</span>
            </div>

            {formErrors.length > 0 && (
              <div className="panel" style={{ background: "var(--negative-bg)", borderColor: "var(--negative)", padding: "12px 16px", color: "var(--negative)", fontSize: "12px" }}>
                <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
                  <AlertCircle size={16} /> Package Validation Errors:
                </div>
                <ul style={{ paddingLeft: "20px", margin: 0 }}>
                  {formErrors.map((err, idx) => (
                    <li key={idx} style={{ marginBottom: "2px" }}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            <section className="supplier-section">
              <div className="supplier-section-header">
                <h3 className="supplier-section-title">
                  <Building2 size={16} /> 1. Supplier Profile
                </h3>
              </div>
              <div className="supplier-grid-2 supplier-profile-grid">
                <div>
                  <label htmlFor="supplier-legalName">Legal Name (တရားဝင်အမည်) *</label>
                  <input
                    type="text"
                    placeholder="e.g. Evershine Co., Ltd."
                    id="supplier-legalName" value={legalName}
                    onChange={(e) => setLegalName(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="supplier-city">City (မြို့) *</label>
                  <input
                    type="text"
                    placeholder="e.g. Yangon, Mandalay"
                    id="supplier-city" value={city}
                    disabled={!!editingId} onChange={(e) => setCity(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="supplier-country">Country *</label>
                  <input
                    type="text"
                    placeholder="Myanmar"
                    id="supplier-country" value={country}
                    disabled={!!editingId} onChange={(e) => setCountry(e.target.value)}
                  />
                </div>
              </div>
            </section>

            <section className="supplier-section">
              <div className="supplier-section-header">
                <h3 className="supplier-section-title">2. Contact & Address</h3>
              </div>
              <div className="supplier-grid-3">
                <div>
                  <label htmlFor="supplier-contactName">Contact Person Name *</label>
                  <input
                    type="text"
                    placeholder="U Aung Kyaw"
                    id="supplier-contactName" value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="supplier-contactPhone">Phone Number *</label>
                  <input
                    type="tel"
                    placeholder="09..."
                    id="supplier-contactPhone" value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="supplier-contactEmail">Email (Optional)</label>
                  <input
                    type="email"
                    placeholder="supplier@mail.com"
                    id="supplier-contactEmail" value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                  />
                </div>
              </div>
              <div className="supplier-grid-4" style={{ marginTop: "14px" }}>
                <div className="supplier-address-line">
                  <label htmlFor="supplier-addressLine">Address Line *</label>
                  <input
                    type="text"
                    placeholder="No. 12, Main Street"
                    id="supplier-addressLine" value={addressLine}
                    onChange={(e) => setAddressLine(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="supplier-cityTownship">Township *</label>
                  <input
                    type="text"
                    placeholder="Hlaing"
                    id="supplier-cityTownship" value={cityTownship}
                    onChange={(e) => setCityTownship(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="supplier-stateRegion">State / Region *</label>
                  <input
                    type="text"
                    placeholder="Yangon"
                    id="supplier-stateRegion" value={stateRegion}
                    onChange={(e) => setStateRegion(e.target.value)}
                  />
                </div>
              </div>
            </section>

            <section className="supplier-section">
              <div className="supplier-section-header">
                <h3 className="supplier-section-title">3. Commercial Agreement & Pricing Titles</h3>
                <button type="button" className="button" onClick={handleAddTitle}>
                  <Plus size={14} /> Add Title
                </button>
              </div>
              {!titles.length && <p className="muted">No adjustments · Total = Sub Total</p>}
              <div className="supplier-grid-2">
                <div>
                  <label htmlFor="supplier-currencyCode">Currency Code (ISO 4217) *</label>
                  <select
                    id="supplier-currencyCode" value={currencyCode}
                    onChange={(e) => {
                      setCurrencyCode(e.target.value);
                      setCurrencyName(SUPPLIER_CURRENCIES.find(currency => currency.code === e.target.value)?.name ?? "");
                    }}
                  >
                    {SUPPLIER_CURRENCIES.map(currency => <option key={currency.code} value={currency.code}>{currency.code} — {currency.name}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="supplier-currencyName">Currency Name</label>
                  <input type="text" disabled id="supplier-currencyName" value={currencyName} />
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "14px" }}>
                {titles.map((t, idx) => (
                  <div key={t.id} className="supplier-item-card">
                    <span style={{ fontWeight: 600, fontSize: "11px", minWidth: "24px" }}>#{idx + 1}</span>
                    <input
                      style={{ flex: 1, minWidth: "160px" }}
                      placeholder="Title Name (e.g. Trade Discount)"
                      value={t.name}
                      onChange={(e) => {
                        setTitles((current) => current.map((title, titleIndex) => titleIndex === idx ? { ...title, name: e.target.value } : title));
                      }}
                    />
                    <select
                      style={{ width: "140px" }}
                      value={t.valueType}
                      onChange={(e) => {
                        setTitles((current) => current.map((title, titleIndex) => titleIndex === idx ? { ...title, valueType: e.target.value as "amount" | "percentage" } : title));
                      }}
                    >
                      <option value="percentage">Percentage (%)</option>
                      <option value="amount">Amount ({currencyCode})</option>
                    </select>
                    <input
                      type="number" step="any"
                      style={{ width: "110px" }}
                      placeholder="Value"
                      value={t.value}
                      onChange={(e) => {
                        setTitles((current) => current.map((title, titleIndex) => titleIndex === idx ? { ...title, value: parseFloat(e.target.value) || 0 } : title));
                      }}
                    />
                    <button type="button" className="button" onClick={() => handleDeleteTitle(t.id)} title={`Delete ${t.name}`} aria-label={`Delete title ${t.name}`}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section className="supplier-section">
              <div className="supplier-section-header">
                <h3 className="supplier-section-title">
                  <Calculator size={16} /> 4. Financial Calculation Formula
                </h3>
                <button type="button" className="button" onClick={handleAddStep} disabled={!titles.length}>
                  <Plus size={14} /> Add Step
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {steps.map((step, idx) => (
                  <div key={step.stepNumber} className="supplier-item-card">
                    <button type="button" aria-label={`Move step ${step.stepNumber} up`} disabled={idx===0} onClick={()=>moveStep(idx,-1)}>↑</button>
                    <button type="button" aria-label={`Move step ${step.stepNumber} down`} disabled={idx===steps.length-1} onClick={()=>moveStep(idx,1)}>↓</button>
                    <span style={{ fontWeight: 600, fontSize: "11px", minWidth: "50px" }}>Step {step.stepNumber}</span>
                    <select
                      style={{ flex: 1, minWidth: "150px" }}
                      value={step.titleId}
                      onChange={(e) => {
                        setSteps((current) => current.map((item, stepIndex) => stepIndex === idx ? { ...item, titleId: e.target.value } : item));
                      }}
                    >
                      {titles.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.value}{t.valueType === "percentage" ? "%" : ""})
                        </option>
                      ))}
                    </select>
                    <select
                      style={{ width: "80px" }}
                      value={step.operator}
                      onChange={(e) => {
                        setSteps((current) => current.map((item, stepIndex) => stepIndex === idx ? { ...item, operator: e.target.value as "+" | "-" | "*" | "/" } : item));
                      }}
                    >
                      <option value="+">+</option>
                      <option value="-">-</option>
                      <option value="*">*</option>
                      <option value="/">/</option>
                    </select>
                    <select
                      style={{ flex: 1, minWidth: "160px" }}
                      value={step.basis}
                      onChange={(e) => {
                        setSteps((current) => current.map((item, stepIndex) => stepIndex === idx ? { ...item, basis: e.target.value as FormulaStep["basis"] } : item));
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
                    <button type="button" className="button" onClick={() => handleDeleteStep(step.stepNumber)} title={`Delete step ${step.stepNumber}`} aria-label={`Delete formula step ${step.stepNumber}`}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="sample-calc-box">
                <div style={{ fontWeight: 600, fontSize: "11px", color: "var(--muted)", marginBottom: "10px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Interactive Calculation Simulator</div>
                <div className="supplier-grid-3">
                  <div>
                    <label style={{ fontSize: "11px", marginBottom: "4px" }}>Sample Base Price</label>
                    <input
                      type="number" step="any"
                      value={sampleBasePrice}
                      onChange={(e) => setSampleBasePrice(parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "11px", marginBottom: "4px" }}>Sample Quantity</label>
                    <input
                      type="number" step="any"
                      value={sampleQuantity}
                      onChange={(e) => setSampleQuantity(parseFloat(e.target.value) || 1)}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "11px", marginBottom: "4px" }}>Sample Prepayment Deposit</label>
                    <input
                      type="number" step="any"
                      value={sampleDeposit}
                      onChange={(e) => setSampleDeposit(parseFloat(e.target.value) || 0)}
                    />
                  </div>
                </div>

                {sampleCalculation.result?.stepDetails.map(detail=><p key={detail.stepNumber} className="supplier-calculation-step">Step {detail.stepNumber} · {detail.titleName} · Basis {detail.basisUsed} · Adjustment {detail.adjustment} · Running result {detail.runningTotal}</p>)}
                {sampleCalculation.error ? (
                  <div style={{ color: "var(--negative)", fontSize: "11px", marginTop: "8px", fontWeight: 500 }}>Warning: {sampleCalculation.error}</div>
                ) : (
                  <div className="sample-calc-result-grid" style={{ marginTop: "14px", paddingTop: "12px", borderTop: "1px solid var(--border)", fontSize: "12px" }}>
                    <div>
                      <span className="muted" style={{ display: "block", fontSize: "10px" }}>Base Amount</span>
                      <strong>{sampleCalculation.result?.total.toLocaleString()} {currencyCode}</strong>
                    </div>
                    <div>
                      <span className="muted" style={{ display: "block", fontSize: "10px" }}>Sub Total (Adjusted)</span>
                      <strong>{sampleCalculation.result?.subTotal.toLocaleString()} {currencyCode}</strong>
                    </div>
                    <div>
                      <span className="muted" style={{ display: "block", fontSize: "10px" }}>Deposit / Advance</span>
                      <strong>{sampleCalculation.result?.deposit.toLocaleString()} {currencyCode}</strong>
                    </div>
                    <div>
                      <span className="muted" style={{ display: "block", fontSize: "10px" }}>Grand Total Payable</span>
                      <strong>{sampleCalculation.result?.grandTotal.toLocaleString()} {currencyCode}</strong>
                    </div>
                  </div>
                )}
              </div>
            </section>

          </div>
            <div className="supplier-reason"><label htmlFor="supplier-reason">Reason Note *</label><textarea id="supplier-reason" value={reason} onChange={e=>setReason(e.target.value)} maxLength={1000} disabled={busy} /></div>
            <div className="form-actions supplier-form-actions">
              <button type="button" disabled={busy} onClick={closeForm}>
                Cancel
              </button>
              <button type="button" disabled={busy || !reason.trim()} onClick={handleSaveDraft}>
                {editingId ? "Save Changes as Draft" : "Save as Draft"}
              </button>
              <button type="button" className="primary" disabled={busy || !reason.trim() || !can("submit")} onClick={handleSubmitApproval}>
                {editingId ? "Submit for Re-approval" : "Submit for Approval"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {viewingSupplier && (
        <Modal title={`Supplier: ${viewingSupplier.legalName}`} onClose={() => setViewingSupplier(null)} wide>
          <div className="form-stack" style={{ maxHeight: "75vh", overflowY: "auto" }}>
            {viewingSupplier.history?.map(rev=><details key={rev.id}>
              <summary>Revision {rev.revision} · {rev.status}{rev.request_id ? ` · Request ${rev.request_id}` : ""}</summary>
              <p>Reason: {rev.reason}</p>
              <SupplierPackageSummary payload={rev.payload}/>
              {rev.status==="pending" && can("submit") && <button onClick={async()=>{
                const note=window.prompt("Reason to withdraw your pending request");if(!note?.trim())return;
                const f=new FormData();f.set("id",String(rev.request_id));f.set("decision","withdraw");f.set("reason",note);
                const result=await decideSupplier(f);setMessage(result.message);setViewingSupplier(null);setSuppliers(await getSuppliers());
              }}>Withdraw request</button>}
            </details>)}
            <KeyValues
              rows={[
                ["Supplier Code", viewingSupplier.code],
                ["Legal Name", viewingSupplier.legalName],
                ["City", viewingSupplier.city],
                ["Status", <Badge key="s">{viewingSupplier.status}</Badge>],
                ["Contact Person", `${viewingSupplier.contact.name} (${viewingSupplier.contact.phone})`],
                [
                  "Address",
                  `${viewingSupplier.address.addressLine}, ${viewingSupplier.address.cityTownship}, ${viewingSupplier.address.stateRegion}, ${viewingSupplier.address.country}`,
                ],
                ["Currency", `${viewingSupplier.agreement.currencyCode} - ${viewingSupplier.agreement.currencyName}`],
              ]}
            />

            <div style={{ borderTop: "1px solid var(--border)", paddingTop: "14px" }}>
              <h4 style={{ fontWeight: 600, fontSize: "13px", marginBottom: "10px" }}>Commercial Agreement Titles</h4>
              <div className="supplier-grid-2">
                {viewingSupplier.agreement.titles.map((t) => (
                  <div key={t.id} className="supplier-item-card" style={{ justifyContent: "space-between" }}>
                    <span>{t.name}</span>
                    <strong>
                      {t.value} {t.valueType === "percentage" ? "%" : viewingSupplier.agreement.currencyCode}
                    </strong>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ borderTop: "1px solid var(--border)", paddingTop: "14px" }}>
              <h4 style={{ fontWeight: 600, fontSize: "13px", marginBottom: "10px" }}>Financial Formula Steps</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {viewingSupplier.formula.steps.map((st) => (
                  <div key={st.stepNumber} className="supplier-item-card" style={{ gap: "20px" }}>
                    <span style={{ fontWeight: 600 }}>Step {st.stepNumber}</span>
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
};
