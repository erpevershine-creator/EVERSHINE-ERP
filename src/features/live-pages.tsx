import { LiveBackups } from "./live-backups";
import { allows } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { requireAccess } from "@/lib/access";
import {
  LiveAccounts,
  LivePermissions,
  LiveApprovals,
} from "./live-administration";
import type { ServerPagination } from "@/components/table";
import { Badge, KeyValues, PageHeading } from "@/components/ui";
import { markNotificationRead } from "@/app/live/actions";

type LiveSearchParams = Record<string, string | string[] | undefined>;
const PAGE_SIZE = 50;
function pageNumber(searchParams?: LiveSearchParams) {
  const value = searchParams?.page;
  const parsed = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 100000) : 1;
}
function pagination(section: string, page: number, total: number): ServerPagination {
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  return {
    page: safePage,
    pageSize: PAGE_SIZE,
    total,
    previousHref: safePage > 1 ? `/${section}?page=${safePage - 1}` : undefined,
    nextHref: safePage < pageCount ? `/${section}?page=${safePage + 1}` : undefined,
  };
}
function ServerPager({
  section,
  page,
  total,
  label,
}: {
  section: string;
  page: number;
  total: number;
  label: string;
}) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = Math.min(page, pages);
  if (pages <= 1) return null;
  return (
    <nav className="table-footer" aria-label={`${label} pages`}>
      <span>{current} / {pages} · {total} total</span>
      <div>
        {current > 1 ? (
          <a href={`/${section}?page=${current - 1}`} aria-label="Previous page">‹</a>
        ) : (
          <button disabled aria-label="Previous page">‹</button>
        )}
        {current < pages ? (
          <a href={`/${section}?page=${current + 1}`} aria-label="Next page">›</a>
        ) : (
          <button disabled aria-label="Next page">›</button>
        )}
      </div>
    </nav>
  );
}

const profileColumns =
  "id,employee_name,company_position,username,department,erp_role,position_id,status,contact,version";
export async function LivePage({
  section,
  searchParams,
}: {
  section: string;
  searchParams?: LiveSearchParams;
}) {
  const access = await requireAccess(section);
  const db = await createClient();
  const page = pageNumber(searchParams);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  if (section === "backups") {
    const { data, count, error } = await db
      .from("local_backup_runs")
      .select(
        "id,reason,status,stage,created_at,finished_at,archive_bytes,table_count,storage_files,manifest_sha256,error_code,origin,scheduled_for,archive_state,pruned_at,prune_error_code",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error) throw new Error("Backup history could not be loaded.");
    const { data: schedule, error: scheduleError } = await db
      .from("local_backup_schedule")
      .select("enabled,last_checked_at")
      .maybeSingle();
    if (scheduleError) throw new Error("Backup schedule could not be loaded.");
    return (
      <LiveBackups
        schedule={schedule}
        runs={data}
        page={page}
        total={count ?? data.length}
        canCreate={
          ["owner", "admin"].includes(access.role) &&
          allows(access, "Backup & Restore", "create")
        }
      />
    );
  }
  if (section === "settings") {
    const [company, locations] = await Promise.all([
      db.from("app_settings").select("company_name,updated_at").maybeSingle(),
      db
        .from("locations")
        .select("code,name,location_type,is_active")
        .eq("is_active", true)
        .order("display_order"),
    ]);
    if (company.error || locations.error || !company.data)
      throw new Error("Company settings could not be loaded.");
    return (
      <>
        <PageHeading
          title="Settings"
          subtitle="Live company configuration and foundation policy status."
        />
        <section className="panel settings-panel">
          <h2>Company profile</h2>
          <KeyValues
            rows={[
              ["Company", company.data.company_name],
              ["Active locations", String(locations.data.length)],
              ["Configuration updated", time(company.data.updated_at)],
            ]}
          />
          <h2>Locations</h2>
          <div className="table-panel live-scroll">
            <table>
              <thead>
                <tr><th>Code</th><th>Name</th><th>Type</th><th>Status</th></tr>
              </thead>
              <tbody>
                {locations.data.map((location) => (
                  <tr key={location.code}>
                    <td>{location.code}</td>
                    <td>{location.name}</td>
                    <td>{location.location_type}</td>
                    <td><Badge>Active</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="panel settings-panel">
          <h2>Foundation policy state</h2>
          <KeyValues
            rows={[
              ["Session admission", "Enforced by server-side device admission"],
              ["Password operations", "Provider receipt and completion fence enforced"],
              ["Approval handover", "Request-scoped for device and permission-template approvals"],
              ["Password expiry reminders", "Daily Yangon reminder ledger; local worker checks while the app is running"],
              ["Approval deadlines", "Three-hour reminder ledger and automatic expiry; local worker checks while the app is running"],
            ]}
          />
        </section>
      </>
    );
  }
  if (section === "usage") {
    return (
      <>
        <PageHeading
          title="Usage Monitor"
          subtitle="Provider usage is unavailable until a monitored connector is configured."
        />
        <section className="panel settings-panel">
          <KeyValues
            rows={[
              ["Hosting", "Local Node.js server"],
              ["Supabase", "Connected through the configured server client"],
              ["Email delivery", "Not connected"],
              ["Provider quota", "Unknown — no value is treated as zero"],
              ["Automatic pause", "Not enabled without a verified usage source"],
            ]}
          />
        </section>
      </>
    );
  }
  if (section === "accounts" || section === "permissions") {
    const [ps, people] = await Promise.all([
      db
        .from("positions")
        .select("id,name,code,erp_role_code,is_owner_position,version")
        .eq("is_active", true)
        .not("erp_role_code", "is", null)
        .order("id"),
      section === "accounts"
        ? db
            .from("profiles")
            .select(profileColumns, { count: "exact" })
            .order("employee_name")
            .range(from, to)
        : db
            .from("profiles")
            .select(profileColumns)
            .order("employee_name")
            .limit(500),
    ]);
    if (ps.error || people.error)
      throw new Error("Accounts could not be loaded.");
    if (section === "accounts")
      return (
        <LiveAccounts
          positions={ps.data}
          profiles={people.data}
          access={access}
          serverPagination={pagination(section, page, people.count ?? people.data.length)}
        />
      );
    const [pages, pp, ap] = await Promise.all([
      db.from("pages").select("id,label").order("display_order"),
      db
        .from("position_page_permissions")
        .select("position_id,page_id,can_view"),
      db
        .from("position_action_permissions")
        .select("position_id,module,action,allowed"),
    ]);
    if (pages.error || pp.error || ap.error)
      throw new Error("Permissions could not be loaded.");
    return (
      <LivePermissions
        positions={ps.data}
        profiles={people.data}
        access={access}
        pages={pages.data}
        pagePermissions={pp.data}
        actionPermissions={ap.data}
      />
    );
  }
  if (section === "approvals") {
    const [rs, ps] = await Promise.all([
      db
        .from("approval_requests")
        .select(
          "id,request_type,requester_id,target_id,reason,status,current_data,proposed_data,decision_reason",
          { count: "exact" },
        )
        .in("request_type", ["position_permissions", "individual_permissions", "device_login"])
        .order("id", { ascending: false })
        .range(from, to),
      db.from("pages").select("id,label").order("display_order"),
    ]);
    if (rs.error || ps.error)
      throw new Error("Approval requests could not be loaded.");
    const capabilities = await db.rpc("request_decision_capabilities", {
      p_requests: rs.data.map((request) => request.id),
    });
    if (capabilities.error) throw new Error("Approval authority could not be verified.");
    const decisionIds = new Set(
      (capabilities.data as { request_id: number; can_decide: boolean }[])
        .filter((row) => row.can_decide).map((row) => row.request_id),
    );
    return (
      <LiveApprovals
        requests={rs.data.map((request) => ({ ...request, can_decide: decisionIds.has(request.id) }))}
        pages={ps.data}
        access={access}
        serverPagination={pagination(section, page, rs.count ?? rs.data.length)}
      />
    );
  }
  const isAudit = section === "audit";
  if (isAudit) {
    const { data, count, error } = await db
      .from("audit_events")
      .select("id,actor_name,action,entity_type,entity_id,reason,occurred_at", { count: "exact" })
      .order("id", { ascending: false })
      .range(from, to);
    if (error) throw new Error("Audit history could not be loaded.");
    return (
      <>
        <PageHeading
          title="Audit & History"
          subtitle="Server-paginated protected audit events · Myanmar time"
        />
        <div className="table-panel live-scroll">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Account</th>
                <th>Action</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id}>
                  <td>{time(r.occurred_at)}</td>
                  <td>{r.actor_name}</td>
                  <td>{r.action}</td>
                  <td>{r.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.length && <p>No events yet.</p>}
        </div>
        <ServerPager section={section} page={page} total={count ?? data.length} label="Audit history" />
      </>
    );
  }
  const { data, count, error } = await db
    .from("notifications")
    .select("id,title,message,read_at,created_at", { count: "exact" })
    .order("id", { ascending: false })
    .range(from, to);
  if (error) throw new Error("Notifications could not be loaded.");
  return (
    <>
      <PageHeading title="Notifications" />
      <section className="panel">
        {data.map((n) => (
          <article className="live-notification" key={n.id}>
            <div>
              <strong>{n.title}</strong>
              <p>{n.message}</p>
              <small>{time(n.created_at)}</small>
            </div>
            {!n.read_at && (
              <form action={markNotificationRead}>
                <input type="hidden" name="id" value={n.id} />
                <button>Mark read</button>
              </form>
            )}
          </article>
        ))}
        {!data.length && <p>No notifications.</p>}
      </section>
      <ServerPager section={section} page={page} total={count ?? data.length} label="Notifications" />
    </>
  );
}
function time(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Yangon",
  }).format(new Date(value));
}
