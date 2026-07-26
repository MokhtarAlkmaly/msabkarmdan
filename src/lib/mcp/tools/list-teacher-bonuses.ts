import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireEnv } from "../env";

function client(ctx: ToolContext) {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_PUBLISHABLE_KEY"), {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_teacher_bonuses",
  title: "List teacher bonuses",
  description: "List monthly teacher bonuses (الإكراميات) for a given Hijri year, optionally filtered by teacher.",
  inputSchema: {
    year: z.string().describe("Hijri year key, e.g. '1446'."),
    teacher_name: z.string().nullable().describe("Optional teacher name filter."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ year, teacher_name }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    let q = client(ctx)
      .from("teacher_bonuses")
      .select("id,teacher_name,year,month,amount")
      .eq("year", year)
      .order("month");
    if (teacher_name) q = q.eq("teacher_name", teacher_name);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const total = (data ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);
    return { content: [{ type: "text", text: JSON.stringify({ bonuses: data, total }) }], structuredContent: { bonuses: data, total } };
  },
});