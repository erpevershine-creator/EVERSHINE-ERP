"use client";
import { useState } from "react";
import {
  RotateCcw,
  Download,
  DatabaseBackup,
  HardDrive,
  CloudOff,
} from "lucide-react";
import { useReview } from "@/components/review-provider";
import { ThemeControl } from "@/components/theme";
import { Badge, KeyValues, PageHeading } from "@/components/ui";
import { policy, quotaPolicy } from "@/lib/policy";

export function Settings() {
  const { actor, reset } = useReview();
  const [tab, setTab] = useState("Company");
  return (
    <>
      <PageHeading
        title="Settings"
        subtitle="Company structure, approved policies and appearance."
      />
      <div className="tabs">
        {["Company", "Security", "Approvals", "Appearance"].map((t) => (
          <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      <section className="panel settings-panel">
        {tab === "Company" ? (
          <>
            <h2>Company profile</h2>
            <KeyValues
              rows={[
                ["Company", policy.company],
                ["Installation", "One company"],
                ["Office", "Head Office"],
                ["Warehouse 01", policy.warehouses[0]],
                ["Warehouse 02", policy.warehouses[1]],
                ["Purchases", "May enter either warehouse"],
                [
                  "Transfers",
                  "Both directions; dispatch and receipt confirmed separately",
                ],
                [
                  "Receipt difference",
                  "Receive actual quantity; unresolved difference remains In Transit",
                ],
              ]}
            />
          </>
        ) : null}
        {tab === "Security" ? (
          <>
            <div className="panel-heading">
              <h2>Confirmed security policies</h2>
              <Badge>Implementation pending</Badge>
            </div>
            <KeyValues
              rows={[
                [
                  "Login",
                  "Company-assigned Gmail address + separate ERP password",
                ],
                [
                  "Password minimum",
                  "8 characters, one uppercase letter, one number",
                ],
                [
                  "Password expiry",
                  "6 months; daily reminders begin 14 days before",
                ],
                [
                  "Wrong password lock",
                  "After 5 attempts; authorized Owner/Admin must unlock",
                ],
                [
                  "Active devices",
                  "Maximum 2; third device requires individual approval",
                ],
                ["Device request expiry", "Maximum 1 day"],
                [
                  "Idle session",
                  "Maximum 7 days, then logout and approved re-entry",
                ],
                [
                  "Owner recovery",
                  "Preverified Gmail or an offline emergency recovery code",
                ],
                [
                  "Recovery sessions",
                  "Log out other active sessions; retain session history",
                ],
                [
                  "Account history retention",
                  "Maximum 3 years; approved PDF + Excel export before deletion",
                ],
              ]}
            />
          </>
        ) : null}
        {tab === "Approvals" ? (
          <>
            <h2>Approval workflow</h2>
            <div className="workflow-strip">
              <Badge>Draft</Badge>
              <span>→</span>
              <Badge>Pending</Badge>
              <span>→</span>
              <Badge>Approved</Badge>
              <span>/</span>
              <Badge>Rejected</Badge>
            </div>
            <KeyValues
              rows={[
                [
                  "Rejection",
                  "Keep rejected decision history; return the request to Draft",
                ],
                ["Self-approval", "Owner only"],
                [
                  "Review order",
                  "Oldest pending request first; no priority levels",
                ],
                ["Decision", "Individual review; no bulk approve or reject"],
                ["Deadline reminders", "Every 3 hours before the deadline"],
                [
                  "Deadline reached",
                  "Request expires; authorized Owner/Admin may copy to a new draft",
                ],
                [
                  "Approved record revision",
                  "Owner or authorized Admin; reason and new version, no extra approval",
                ],
                [
                  "Permission changes",
                  "Apply only to accounts listed in the approved request",
                ],
              ]}
            />
          </>
        ) : null}
        {tab === "Appearance" ? (
          <>
            <h2>Workspace appearance</h2>
            <div className="setting-line">
              <div>
                <strong>Theme</strong>
                <p className="muted">Light, dark, or follow this device.</p>
              </div>
              <ThemeControl />
            </div>
            <KeyValues
              rows={[
                ["Interface", "Compact tables and restrained headings"],
                ["Font", "System UI with local Myanmar font fallback"],
                ["Loading", "Local assets; no remote fonts or analytics"],
              ]}
            />
            <div className="setting-line">
              <div>
                <strong>Reset sample workspace</strong>
                <p className="muted">
                  Restore only the sample requests, notifications and activity.
                </p>
              </div>
              <button
                disabled={actor.role !== "Owner"}
                onClick={() => {
                  if (
                    window.confirm(
                      "Reset the sample workspace in this browser tab?",
                    )
                  )
                    reset();
                }}
              >
                <RotateCcw size={15} /> Reset samples
              </button>
            </div>
          </>
        ) : null}
      </section>
    </>
  );
}
export function Backups() {
  return (
    <>
      <PageHeading
        title="Backup & Restore"
        subtitle="Controlled backups with a verified recovery process."
      />
      <section className="panel backup-empty">
        <DatabaseBackup size={30} />
        <h2>No database connected</h2>
        <p>
          Backup and restore become available after local database setup and
          recovery rules are confirmed.
        </p>
        <div>
          <button disabled>
            <Download size={15} /> Create backup
          </button>
          <button disabled>
            <HardDrive size={15} /> Restore backup
          </button>
        </div>
      </section>
      <section className="panel settings-panel">
        <h2>Implementation boundary</h2>
        <KeyValues
          rows={[
            [
              "Current sample records",
              "Browser-tab review state; not a database backup",
            ],
            ["Database backup", "Not implemented in Milestone 1"],
            ["Restore validation", "Required before real data is used"],
            [
              "Pending decisions",
              "Frequency, storage destination, encryption and recovery target",
            ],
          ]}
        />
      </section>
    </>
  );
}
export function Usage() {
  const [percent, setPercent] = useState(79);
  const result = quotaPolicy(percent);
  return (
    <>
      <PageHeading
        title="Usage Monitor"
        subtitle="Provider status and the confirmed 80% usage controls."
      />
      <div className="service-grid">
        {[
          {
            title: "Hosting",
            subtitle: "Local Node.js server",
            state: "Local",
          },
          {
            title: "Supabase",
            subtitle: "Database / Auth / Storage",
            state: "Not connected",
          },
          {
            title: "Email",
            subtitle: "Outbound email provider",
            state: "Not connected",
          },
        ].map((s) => (
          <section className="panel service-card" key={s.title}>
            <div>
              <CloudOff size={18} />
              <Badge>{s.state}</Badge>
            </div>
            <h2>{s.title}</h2>
            <p>{s.subtitle}</p>
            <div className="service-value">
              — <small>Live usage unavailable</small>
            </div>
          </section>
        ))}
      </div>
      <section className="panel settings-panel">
        <div className="panel-heading">
          <h2>Usage rule preview</h2>
          <span className="sample-label">Simulation</span>
        </div>
        <p className="muted">
          Adjust the sample value to review the policy. This is not live
          provider usage.
        </p>
        <label className="usage-range">
          Sample usage <strong>{percent}%</strong>
          <input
            type="range"
            aria-label="Sample usage"
            min={0}
            max={100}
            value={percent}
            onChange={(e) => setPercent(Number(e.target.value))}
          />
        </label>
        <KeyValues
          rows={[
            [
              "Outgoing email",
              <Badge key="email">
                {result.pauseEmail ? "Paused" : "Below threshold"}
              </Badge>,
            ],
            [
              "Scheduled reports",
              <Badge key="report">
                {result.pauseScheduledReports ? "Paused" : "Below threshold"}
              </Badge>,
            ],
            ["In-app notifications", "Remain available"],
            [
              "Authorized manual export",
              percent >= 80 ? "Allowed with usage warning" : "Allowed",
            ],
            [
              "Core login / business entry",
              "Prioritized; provider hard quotas can still interrupt service",
            ],
          ]}
        />
      </section>
      <p className="footnote">
        Production hosting remains open: Vercel Hobby permits personal,
        non-commercial use only. Company ERP hosting needs a compatible plan or
        alternative.
      </p>
    </>
  );
}
