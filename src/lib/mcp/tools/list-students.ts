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
  name: "list_students",
  title: "List students",
  description: "List the signed-in user's students, optionally filtered by teacher name.",
  inputSchema: {
    teacher: z.string().nullable().describe("Optional exact teacher name to filter by."),
    limit: z.number().int().min(1).max(500).nullable().describe("Max rows to return. Default 100."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ teacher, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    let q = client(ctx).from("students").select("id,name,teacher,created_at").order("name");
    if (teacher) q = q.eq("teacher", teacher);
    q = q.limit(limit ?? 100);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: { students: data } };
  },
});