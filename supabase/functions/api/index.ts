import { background, cors, db, json, todayTunis } from "../_shared/common.ts";
import { hashPin, safeEqual, signToken, verifyPin, verifyToken } from "../_shared/auth.ts";
import { notifyMembers } from "../_shared/push.ts";
import { secret } from "../_shared/secrets.ts";

const MAX_FAILS = 5;
const LOCK_MIN = 10;
const PIN_RE = /^\d{4}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

async function notifyOthers(actorId: string, today: string) {
  const [{ data: members }, { data: checks }] = await Promise.all([
    db.from("members").select("id,handle"),
    db.from("checkins").select("member_id,status").eq("day", today),
  ]);
  const all = members ?? [];
  const doneIds = new Set((checks ?? []).map((c) => c.member_id));
  const done = (checks ?? []).filter((c) => c.status === 1).length;
  const actor = all.find((m) => m.id === actorId);
  const targets = all.filter((m) => m.id !== actorId && !doneIds.has(m.id)).map((m) => m.id);
  if (!actor || !targets.length) return;
  await notifyMembers(
    targets,
    {
      title: "ورد اليوم 🌸",
      body: `@${actor.handle} كمّلت ورد اليوم (${done}/${all.length}) — دورك!`,
      tag: "wird-friend",
    },
    60, // at most one friend-push per device per hour
  );
}

async function handleAdmin(action: string, body: any) {
  switch (action) {
    case "admin_members": {
      const { data } = await db.from("members").select("id,handle,pin_hash,locked_until").order("position");
      return json({
        members: (data ?? []).map((m) => ({ id: m.id, handle: m.handle, claimed: !!m.pin_hash, locked_until: m.locked_until })),
      });
    }
    case "admin_save_config": {
      const ranges = Array.isArray(body.ranges) ? body.ranges.slice(0, 30).map((r: any) => ({
        f: Number.isInteger(r?.f) ? r.f : null,
        t: Number.isInteger(r?.t) ? r.t : null,
      })) : [];
      if (!DAY_RE.test(body.start_date ?? "")) return json({ error: "bad_date" }, 400);
      const surah = String(body.surah ?? "").trim().slice(0, 40) || "البقرة";
      await db.from("config").update({ start_date: body.start_date, surah, ranges }).eq("id", 1);
      return json({ ok: true });
    }
    case "admin_add_member": {
      const handle = String(body.handle ?? "").replace(/^@/, "").trim().slice(0, 60);
      if (!handle) return json({ error: "bad_handle" }, 400);
      const { error } = await db.from("members").insert({ handle });
      return error ? json({ error: "exists" }, 409) : json({ ok: true });
    }
    case "admin_remove_member":
      await db.from("members").delete().eq("id", body.id);
      return json({ ok: true });
    case "admin_reset_pin":
      await db.from("members").update({ pin_hash: null, pin_salt: null, failed_attempts: 0, locked_until: null }).eq("id", body.id);
      return json({ ok: true });
    case "admin_mark": {
      const status = Number(body.status);
      if (!DAY_RE.test(body.day ?? "") || ![0, 1, 2].includes(status)) return json({ error: "bad_input" }, 400);
      if (status === 0) await db.from("checkins").delete().eq("member_id", body.id).eq("day", body.day);
      else await db.from("checkins").upsert({ member_id: body.id, day: body.day, status, marked_at: new Date().toISOString() });
      return json({ ok: true });
    }
  }
  return json({ error: "unknown_action" }, 400);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const action: string = body.action ?? "";

    // ---- admin (shared secret) ----
    if (action.startsWith("admin_")) {
      const key = req.headers.get("x-admin-key") ?? "";
      const real = await secret("ADMIN_KEY");
      if (!real || !safeEqual(key, real)) {
        await new Promise((r) => setTimeout(r, 600));
        return json({ error: "forbidden" }, 403);
      }
      return await handleAdmin(action, body);
    }

    // ---- public: login picker, login, first-time PIN ----
    if (action === "list_members") {
      const { data } = await db.from("members").select("id,handle,pin_hash").order("position");
      return json({ members: (data ?? []).map((m) => ({ id: m.id, handle: m.handle, claimed: !!m.pin_hash })) });
    }

    if (action === "login" || action === "claim") {
      const pin = String(body.pin ?? "");
      if (!PIN_RE.test(pin)) return json({ error: "bad_pin_format" }, 400);
      const { data: m } = await db.from("members").select("*").eq("id", body.member_id).maybeSingle();
      if (!m) return json({ error: "not_found" }, 404);

      if (action === "claim") {
        if (m.pin_hash) return json({ error: "already_claimed" }, 409);
        const { salt, hash } = await hashPin(pin);
        const { data: upd } = await db.from("members")
          .update({ pin_hash: hash, pin_salt: salt, failed_attempts: 0, locked_until: null })
          .eq("id", m.id).is("pin_hash", null).select("id");
        if (!upd?.length) return json({ error: "already_claimed" }, 409);
        return json({ token: await signToken(m.id), member: { id: m.id, handle: m.handle } });
      }

      if (!m.pin_hash) return json({ error: "not_claimed" }, 409);
      if (m.locked_until && new Date(m.locked_until) > new Date()) {
        return json({ error: "locked", until: m.locked_until }, 429);
      }
      if (!(await verifyPin(pin, m.pin_salt, m.pin_hash))) {
        const fails = m.failed_attempts + 1;
        const lock = fails >= MAX_FAILS;
        await db.from("members").update({
          failed_attempts: lock ? 0 : fails,
          locked_until: lock ? new Date(Date.now() + LOCK_MIN * 60_000).toISOString() : null,
        }).eq("id", m.id);
        return json({ error: lock ? "locked" : "bad_pin", left: Math.max(0, MAX_FAILS - fails) }, 401);
      }
      if (m.failed_attempts) await db.from("members").update({ failed_attempts: 0, locked_until: null }).eq("id", m.id);
      return json({ token: await signToken(m.id), member: { id: m.id, handle: m.handle } });
    }

    // ---- authenticated member ----
    const me = await verifyToken(req.headers.get("x-token"));
    if (!me) return json({ error: "unauthorized" }, 401);
    const { data: self } = await db.from("members").select("id").eq("id", me).maybeSingle();
    if (!self) return json({ error: "unauthorized" }, 401);

    if (action === "state") {
      const { data: config } = await db.from("config").select("start_date,surah,ranges").eq("id", 1).single();
      const [{ data: members }, { data: checks }, { count }] = await Promise.all([
        db.from("members").select("id,handle").order("position"),
        db.from("checkins").select("member_id,day,status").gte("day", config!.start_date),
        db.from("push_subs").select("endpoint", { count: "exact", head: true }).eq("member_id", me),
      ]);
      return json({
        today: todayTunis(),
        config,
        me,
        members: members ?? [],
        checkins: (checks ?? []).map((c) => ({ m: c.member_id, d: c.day, s: c.status })),
        notifications: (count ?? 0) > 0,
      });
    }

    if (action === "mark") {
      const today = todayTunis();
      const { data: config } = await db.from("config").select("start_date").eq("id", 1).single();
      if (today < config!.start_date) return json({ error: "not_started" }, 400);
      const { data: prev } = await db.from("checkins").select("status").eq("member_id", me).eq("day", today).maybeSingle();
      if (Number(body.status) === 1) {
        await db.from("checkins").upsert({ member_id: me, day: today, status: 1, marked_at: new Date().toISOString() });
        if (prev?.status !== 1) background(notifyOthers(me, today));
      } else if (prev?.status === 1) {
        await db.from("checkins").delete().eq("member_id", me).eq("day", today);
      }
      return json({ ok: true });
    }

    if (action === "push_subscribe") {
      const s = body.subscription;
      if (!s?.endpoint || !s?.keys?.p256dh || !s?.keys?.auth) return json({ error: "bad_subscription" }, 400);
      await db.from("push_subs").upsert({
        endpoint: s.endpoint, member_id: me, p256dh: s.keys.p256dh, auth: s.keys.auth,
      });
      return json({ ok: true });
    }

    if (action === "push_unsubscribe") {
      await db.from("push_subs").delete().eq("member_id", me).eq("endpoint", body.endpoint ?? "");
      return json({ ok: true });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: "server" }, 500);
  }
});
