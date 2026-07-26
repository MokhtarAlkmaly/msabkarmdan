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
  name: "get_student_year_data",
  title: "Get student year data",
  description: "Fetch a student's competition data (grades, hifz, teacher, prize) for a specific Hijri year.",
  inputSchema: {
    student_id: z.number().int().describe("Student id."),
    year: z.string().describe("Hijri year key, e.g. '1446'."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ student_id, year }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const { data, error } = await client(ctx)
      .from("year_data")
      .select("*")
      .eq("student_id", student_id)
      .eq("year", year)
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: { year_data: data } };
  },
});