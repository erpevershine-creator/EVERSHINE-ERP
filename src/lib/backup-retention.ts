export type RetentionBackup = {
  id: string;
  origin: string;
  status: string;
  created_at: string;
  archive_state?: string;
  prune_replacement_id?: string | null;
};
export type RetentionRow = {
  id: string;
  created_at: string;
  origin: string;
  decision: "keep" | "candidate" | "removed";
  reasons: string[];
};
export function planBackupRetention(
  backups: RetentionBackup[],
  now = new Date(),
): RetentionRow[] {
  const parts = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Yangon",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(d);
  const day = (d: Date) => {
    const p = parts(d);
    return ["year", "month", "day"]
      .map((k) => p.find((x) => x.type === k)!.value)
      .join("-");
  };
  const today = day(now),
    ids = new Set<string>();
  for (const b of backups) {
    if (ids.has(b.id)) throw Error("Duplicate backup identity");
    ids.add(b.id);
  }
  const sorted = [...backups].sort(
    (a, b) =>
      Date.parse(b.created_at) - Date.parse(a.created_at) ||
      a.id.localeCompare(b.id),
  );
  const valid = (b: RetentionBackup) =>
    Number.isFinite(Date.parse(b.created_at)) &&
    Date.parse(b.created_at) <= now.getTime();
  const present = (b: RetentionBackup) =>
    (b.archive_state ?? "present") === "present";
  const eligible = sorted.filter(
    (b) =>
      b.origin === "scheduled" &&
      b.status === "verified" &&
      present(b) &&
      valid(b),
  );
  const reasons = new Map<string, string[]>();
  const keep = (id: string, reason: string) =>
    reasons.set(id, [...(reasons.get(id) ?? []), reason]);
  function tier(
    limit: number,
    label: string,
    key: (b: RetentionBackup) => string,
    accept: (k: string) => boolean,
  ) {
    const seen = new Set<string>();
    for (const b of eligible) {
      const k = key(b);
      if (!accept(k) || seen.has(k)) continue;
      if (seen.size === limit) break;
      seen.add(k);
      keep(b.id, label);
    }
  }
  tier(
    7,
    "Daily",
    (b) => day(new Date(b.created_at)),
    () => true,
  );
  tier(
    3,
    "Monthly",
    (b) => day(new Date(b.created_at)).slice(0, 7),
    (k) => k < today.slice(0, 7),
  );
  tier(
    1,
    "Yearly",
    (b) => day(new Date(b.created_at)).slice(0, 4),
    (k) => k < today.slice(0, 4),
  );
  for (const b of sorted) {
    if (b.archive_state === "pruning" && b.prune_replacement_id)
      keep(b.prune_replacement_id, "Recovery dependency");
    if (b.origin === "manual") keep(b.id, "Manual backup");
    else if (b.origin !== "scheduled") keep(b.id, "Unknown source");
    if (!valid(b)) keep(b.id, "Check backup date");
    if (b.status !== "verified") keep(b.id, "Not verified");
    if (!present(b) && b.archive_state !== "pruned")
      keep(b.id, "Removal in progress");
  }
  const newest = sorted.find(
    (b) => b.status === "verified" && present(b) && valid(b),
  );
  if (newest) keep(newest.id, "Latest verified");
  return sorted.map((b) => ({
    id: b.id,
    created_at: b.created_at,
    origin: b.origin,
    decision:
      b.archive_state === "pruned"
        ? "removed"
        : reasons.has(b.id)
          ? "keep"
          : "candidate",
    reasons:
      b.archive_state === "pruned"
        ? ["Archive removed; history retained"]
        : (reasons.get(b.id) ?? ["Outside retained periods"]),
  }));
}
