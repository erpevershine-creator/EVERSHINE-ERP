import { createClient } from "@/lib/supabase/server";
import { requireAccess } from "@/lib/access";
import {
  LiveAccounts,
  LivePermissions,
  LiveApprovals,
} from "./live-administration";
import { PageHeading } from "@/components/ui";
import { markNotificationRead } from "@/app/live/actions";

const profileColumns =
  "id,employee_name,company_position,username,department,erp_role,position_id,status,contact,version";
export async function LivePage({ section }: { section: string }) {
  const access = await requireAccess(section);
  const db = await createClient();
  if (section === "accounts" || section === "permissions") {
    const [ps, people] = await Promise.all([
      db
        .from("positions")
        .select("id,name,code,erp_role_code,is_owner_position,version")
        .eq("is_active", true)
        .not("erp_role_code", "is", null)
        .order("id"),
      db
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
        )
        .in("request_type", ["position_permissions", "individual_permissions"])
        .order("id", { ascending: false })
        .limit(200),
      db.from("pages").select("id,label").order("display_order"),
    ]);
    if (rs.error || ps.error)
      throw new Error("Approval requests could not be loaded.");
    return <LiveApprovals requests={rs.data} pages={ps.data} access={access} />;
  }
  const isAudit = section === "audit";
  if (isAudit) {
    const { data, error } = await db
      .from("audit_events")
      .select("id,actor_name,action,entity_type,entity_id,reason,occurred_at")
      .order("id", { ascending: false })
      .limit(100);
    if (error) throw new Error("Audit history could not be loaded.");
    return (
      <>
        <PageHeading
          title="Audit & History"
          subtitle="Latest 100 events · Myanmar time"
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
      </>
    );
  }
  const { data, error } = await db
    .from("notifications")
    .select("id,title,message,read_at,created_at")
    .order("id", { ascending: false })
    .limit(100);
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
