// Le Grand Tour "assistant" Edge Function (Gemini-backed).
// Source of record for the deployed function (project bsbuhkzdebqobkpxtivb).
//
// Two modes, both requiring a signed-in trip user (the Gemini key stays server side):
//   • place  — turn a raw note OR a pasted link into one structured place. Links are
//              read via Gemini's url_context tool; falls back to a schema-only call.
//   • story  — write a short, grounded trip recap from the supplied journal entries.
//
// Notes: gemini-2.5-flash is a thinking model, so thinking is disabled (thinkingBudget 0)
// to keep latency/cost down and leave the output budget for the actual response.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const CATS = ["Eat & Drink", "See & Do", "Shop"];
const TAGS = ["Fancy dinner", "Long lunch", "Quick bite", "Coffee & cake", "Wine bar", "Cheap & cheerful", "Sweet treat", "Must-see", "Hidden gem", "Golden hour", "Browse & buy"];
const CITIES = ["Paris", "Bordeaux", "Copenhagen", "London"];
const MODEL = "gemini-2.5-flash";

function json(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

const SYS_PLACE = `You convert a traveller's raw note or pasted link into ONE structured place for a trip app covering Paris, Bordeaux, Copenhagen, London. Rules: choose category strictly from the allowed list; choose tag strictly from the allowed list; set city only if clearly implied, else leave empty; if the input is a URL, use the linked page's actual content to fill the fields; NEVER invent facts (hours, prices, founding dates, ratings, claims) that are not present in the input or the linked page; the note field should only restate what the source actually says, concise, Australian English, no em dashes; if a field is unknown leave it empty. Respond with a single JSON object only, no markdown.`;

const SYS_STORY = `You write a short, warm recap of a couple's trip for their travel app. Australian English, second person plural ("you"). 2 to 3 short sentences, about 60 words, one paragraph. Base it ONLY on the supplied journal entries. Keep each place in the exact city it is listed under; do NOT move places between cities, and do NOT add landmarks, quotes, dishes or facts that are not in the entries. Warm and personal but grounded and accurate. No em dashes, no quotation marks, no lists, no headings.`;

const PLACE_SCHEMA = {
  type: "object",
  properties: { name: { type: "string" }, city: { type: "string" }, cat: { type: "string", enum: CATS }, tag: { type: "string", enum: TAGS }, area: { type: "string" }, note: { type: "string" } },
  required: ["name", "cat", "tag"],
};

async function callGemini(key: string, payload: unknown) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  return await r.json();
}
function extractText(g: any): string {
  const parts = g?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts.map((p: any) => p?.text || "").join("").trim();
}
function parseLooseJson(txt: string) {
  let t = (txt || "").trim();
  if (t.startsWith("```")) t = t.replace(/^```(json)?/i, "").replace(/```$/, "").trim();
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a >= 0 && b > a) t = t.slice(a, b + 1);
  return JSON.parse(t);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Require a signed-in trip user, so AI quota cannot be spent by viewers or a leaked URL.
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauthorised" }, 401);

    const bodyIn = await req.json().catch(() => ({} as any));
    const mode = (bodyIn?.mode || "place").toString();

    const admin = createClient(url, service);
    const { data: secret, error: secErr } = await admin.from("app_secrets").select("value").eq("name", "gemini_api_key").single();
    if (secErr || !secret?.value) return json({ error: "gemini key not configured" }, 500);
    const K = secret.value as string;

    // ---- STORY MODE: grounded trip recap from the journal ----
    if (mode === "story") {
      const entries = Array.isArray(bodyIn?.entries) ? bodyIn.entries : [];
      if (!entries.length) return json({ error: "no entries" }, 400);
      const lines = entries.slice(0, 80).map((e: any) => {
        const r = (e?.you || e?.her) ? ` (rated ${e?.you || 0} and ${e?.her || 0})` : "";
        const where = e?.city ? ` in ${e.city}` : "";
        const note = e?.note ? `: ${String(e.note).slice(0, 160)}` : "";
        return `- ${e?.type || "Note"}: ${e?.title || ""}${where}${r}${note}`;
      }).join("\n");
      const tripName = (bodyIn?.trip?.name || "the trip").toString();
      const payload = {
        system_instruction: { parts: [{ text: SYS_STORY }] },
        contents: [{ parts: [{ text: `Trip: ${tripName}. Route in order: Sydney, Paris, Bordeaux, Copenhagen, London.\n\nJournal entries (each shows its city):\n${lines}` }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 500, thinkingConfig: { thinkingBudget: 0 } },
      };
      const g = await callGemini(K, payload);
      const txt = extractText(g);
      if (!txt) return json({ error: "no result", detail: g?.error?.message || null }, 502);
      return json({ text: txt });
    }

    // ---- PLACE MODE: raw note or link -> one structured place ----
    const input = (bodyIn?.input || "").toString().trim();
    if (!input) return json({ error: "empty input" }, 400);
    const isUrl = /^https?:\/\//i.test(input);
    const contents = [{ parts: [{ text: `Allowed categories: ${CATS.join(", ")}. Allowed tags: ${TAGS.join(", ")}. Allowed cities: ${CITIES.join(", ")}.\n\nRaw input: ${input}` }] }];

    const buildPayload = (withTools: boolean) => {
      const p: any = {
        system_instruction: { parts: [{ text: SYS_PLACE }] },
        contents,
        // responseSchema cannot combine with tools, so the URL path relies on the
        // prompt + server-side enum validation below instead of a hard schema.
        generationConfig: withTools
          ? { responseMimeType: "application/json", maxOutputTokens: 1200, thinkingConfig: { thinkingBudget: 0 } }
          : { responseMimeType: "application/json", responseSchema: PLACE_SCHEMA, maxOutputTokens: 1200, thinkingConfig: { thinkingBudget: 0 } },
      };
      if (withTools) p.tools = [{ url_context: {} }];
      return p;
    };

    // Links: let the model read the page (url_context). Fall back to the plain
    // schema call if the tool path yields nothing, so behaviour never regresses.
    let txt = "";
    if (isUrl) { try { txt = extractText(await callGemini(K, buildPayload(true))); } catch (_) { txt = ""; } }
    if (!txt) { const g = await callGemini(K, buildPayload(false)); txt = extractText(g); if (!txt) return json({ error: "no result", detail: g?.error?.message || null }, 502); }

    let place: Record<string, unknown>;
    try { place = parseLooseJson(txt); } catch { return json({ error: "unparseable model output" }, 502); }

    if (!CATS.includes(place.cat as string)) delete place.cat;
    if (!TAGS.includes(place.tag as string)) delete place.tag;
    if (place.city && !CITIES.includes(place.city as string)) place.city = "";

    return json({ place });
  } catch (e) {
    console.error("assistant error", String(e));
    return json({ error: String(e) }, 500);
  }
});
