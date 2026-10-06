import { db, json, todayTunis } from "../_shared/common.ts";
import { safeEqual } from "../_shared/auth.ts";
import { notifyMembers } from "../_shared/push.ts";
import { secret } from "../_shared/secrets.ts";

// Called once a day by pg_cron (see README). Reminds everyone who has not finished today.
Deno.serve(async (req) => {
  const expected = await secret("CRON_SECRET");
  if (!expected || !safeEqual(req.headers.get("x-cron-secret") ?? "", expected)) {
    return json({ error: "forbidden" }, 403);
  }
  const today = todayTunis();
  const { data: config } = await db.from("config").select("start_date").eq("id", 1).single();
  if (today < config!.start_date) return json({ skipped: "not_started" });

  const [{ data: members }, { data: checks }] = await Promise.all([
    db.from("members").select("id"),
    db.from("checkins").select("member_id").eq("day", today),
  ]);
  const done = new Set((checks ?? []).map((c) => c.member_id));
  const targets = (members ?? []).filter((m) => !done.has(m.id)).map((m) => m.id);
  const res = await notifyMembers(targets, {
    title: "ورد اليوم 🌸",
    body: "جدّدي نيّتك واحتسبي الأجر، ورد اليوم من سورة البقرة ينتظرك",
    tag: "wird-reminder",
  });
  return json({ reminded: res.sent });
});
