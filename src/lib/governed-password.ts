// Provider response is advisory. Only a committed database receipt can authorize
// success; missing evidence leaves access fenced for a governed retry.
type Dependencies = {
  update: () => Promise<{ error: { status?: number } | null }>;
  receipt: () => Promise<{ data: boolean | null; error: unknown }>;
  finish: (success: boolean) => Promise<{ error: unknown }>;
};

export async function completeGovernedPasswordChange(deps: Dependencies): Promise<"completed" | "failed" | "pending"> {
  let rejected = false;
  try {
    const result = await deps.update();
    rejected = !!result.error?.status && result.error.status >= 400 && result.error.status < 500;
  } catch {
    // A lost response can follow a successful commit. Check the receipt below.
  }
  try {
    const proof = await deps.receipt();
    if (proof.error || typeof proof.data !== "boolean") return "pending";
    if (proof.data) return (await deps.finish(true)).error ? "pending" : "completed";
    if (rejected) return (await deps.finish(false)).error ? "pending" : "failed";
  } catch {
    return "pending";
  }
  return "pending";
}
