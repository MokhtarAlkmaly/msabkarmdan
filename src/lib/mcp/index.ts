import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listStudents from "./tools/list-students";
import listTeachers from "./tools/list-teachers";
import listTeacherBonuses from "./tools/list-teacher-bonuses";
import getStudentYearData from "./tools/get-student-year-data";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "ramadan-competition-mcp",
  title: "كشف المسابقة الرمضانية — MCP",
  version: "0.1.0",
  instructions:
    "Tools for the Ramadan Quran memorization competition app. Read students, teachers, per-year competition data, and monthly teacher bonuses for the signed-in user.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listStudents, listTeachers, listTeacherBonuses, getStudentYearData],
});