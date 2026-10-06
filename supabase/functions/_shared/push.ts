import webpush from "npm:web-push@3.6.7";
import { db } from "./common.ts";
import { secret } from "./secrets.ts";

let vapidReady = false;
async function ensureVapid() {
  if (vapidReady) return;
  webpush.setVapidDetails(
    await secret("VAPID_SUBJECT"),
    await secret("VAPID_PUBLIC_KEY"),
    await secret("VAPID_PRIVATE_KEY"),
  );
  vapidReady = true;
}

export type Payload = { title: string; body: string; tag?: string };

/**
 * Send a web push to every device of the given members.
 * throttleMin: skip devices that were notified less than N minutes ago (0 = no throttle).
 */
export async function notifyMembers(memberIds: string[], payload: Payload, throttleMin = 0) {
  if (!memberIds.length) return { sent: 0 };
  await ensureVapid();
  const { data: subs } = await db
    .from("push_subs")
    .select("endpoint,p256dh,auth,last_notified_at")
    .in("member_id", memberIds);
  const cutoff = Date.now() - throttleMin * 60_000;
  const targets = (subs ?? []).filter(
    (s) => !throttleMin || !s.last_notified_at || new Date(s.last_notified_at).getTime() < cutoff,
  );
  const body = JSON.stringify(payload);
  const results = await Promise.allSettled(
    targets.map((s) =>
      webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 3600 })
    ),
  );
  const dead: string[] = [];
  const ok: string[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") ok.push(targets[i].endpoint);
    else {
      const code = (r.reason as { statusCode?: number })?.statusCode;
      if (code === 404 || code === 410) dead.push(targets[i].endpoint);
    }
  });
  if (dead.length) await db.from("push_subs").delete().in("endpoint", dead);
  if (ok.length) {
    await db.from("push_subs").update({ last_notified_at: new Date().toISOString() }).in("endpoint", ok);
  }
  return { sent: ok.length };
}
