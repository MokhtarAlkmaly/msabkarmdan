import { supabase } from "@/integrations/supabase/client";
import { getViewAsUserId } from "@/utils/storage";
import { START_YEAR } from "@/types/student";

export interface StudentRegistryRow {
  id: number;
  name: string;
  teacher: string;
  join_date_hijri: string | null;
  prior_hifz: number;
  status: string | null;
  school_year: string | null;
  guardian_phone: string | null;
  student_phone: string | null;
  extra: Record<string, string>;
}

export interface CustomColumn {
  id: string;
  key: string;
  label: string;
  col_type: "text" | "number" | "date";
  sort_order: number;
}

export const DEFAULT_STATUSES = ["يتيم", "معوق", "من أسرة متعففة", "طالب عادي"];

export const resolveUserId = async (): Promise<string | null> => {
  const viewAs = getViewAsUserId();
  if (viewAs) return viewAs;
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
};

const SELECT_COLS =
  "id,name,teacher,join_date_hijri,prior_hifz,status,school_year,guardian_phone,student_phone,extra";

export const loadStudentRegistry = async (): Promise<StudentRegistryRow[]> => {
  const userId = await resolveUserId();
  if (!userId) return [];
  const { data, error } = await supabase
    .from("students")
    .select(SELECT_COLS)
    .eq("user_id", userId)
    .order("name");
  if (error) { console.error("loadStudentRegistry failed:", error); return []; }
  return (data || []).map((r: any) => ({
    ...r,
    prior_hifz: Number(r.prior_hifz) || 0,
    extra: (r.extra && typeof r.extra === "object" ? r.extra : {}) as Record<string, string>,
  }));
};

export const loadStudentRegistryRow = async (id: number): Promise<StudentRegistryRow | null> => {
  const userId = await resolveUserId();
  if (!userId) return null;
  const { data, error } = await supabase
    .from("students")
    .select(SELECT_COLS)
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  const r: any = data;
  return {
    ...r,
    prior_hifz: Number(r.prior_hifz) || 0,
    extra: (r.extra && typeof r.extra === "object" ? r.extra : {}) as Record<string, string>,
  };
};

export const saveStudentRegistryRow = async (row: StudentRegistryRow): Promise<boolean> => {
  const userId = await resolveUserId();
  if (!userId || getViewAsUserId()) return false;
  const { error } = await supabase
    .from("students")
    .update({
      name: row.name,
      join_date_hijri: row.join_date_hijri || null,
      prior_hifz: row.prior_hifz || 0,
      status: row.status || null,
      school_year: row.school_year || null,
      guardian_phone: row.guardian_phone || null,
      student_phone: row.student_phone || null,
      extra: row.extra || {},
    })
    .eq("id", row.id)
    .eq("user_id", userId);
  if (error) { console.error("saveStudentRegistryRow failed:", error); return false; }
  await applyPriorHifzToFirstYear(row.id, row.prior_hifz || 0);
  return true;
};

// مقدار الحفظ قبل الالتحاق يُسجَّل في أول عام مسابقة للطالب كحفظ مسبق
export const applyPriorHifzToFirstYear = async (studentId: number, priorHifz: number) => {
  const userId = await resolveUserId();
  if (!userId || getViewAsUserId()) return;

  const { data } = await supabase
    .from("year_data")
    .select("year")
    .eq("user_id", userId)
    .eq("student_id", studentId)
    .order("year", { ascending: true })
    .limit(1);

  const firstYear = data?.[0]?.year || String(START_YEAR);
  // سنة الحفظ المسبق = العام الذي يسبق أول عام مسابقة
  const priorYear = String(parseInt(firstYear) - 1);

  if (!priorHifz) {
    await supabase
      .from("hifz_history")
      .delete()
      .eq("user_id", userId)
      .eq("student_id", studentId)
      .eq("year_key", priorYear);
    return;
  }

  const { data: existing } = await supabase
    .from("hifz_history")
    .select("id")
    .eq("user_id", userId)
    .eq("student_id", studentId)
    .eq("year_key", priorYear)
    .maybeSingle();

  if (existing?.id) {
    await supabase.from("hifz_history").update({ value: String(priorHifz) }).eq("id", existing.id);
  } else {
    await supabase.from("hifz_history").insert({
      user_id: userId,
      student_id: studentId,
      year_key: priorYear,
      value: String(priorHifz),
    });
  }
};

// ===== الحالات (قابلة للتوسيع) =====
export const loadStatuses = async (): Promise<string[]> => {
  const userId = await resolveUserId();
  if (!userId) return DEFAULT_STATUSES;
  const { data } = await supabase
    .from("student_statuses")
    .select("name")
    .eq("user_id", userId)
    .order("name");
  const custom = (data || []).map((r: any) => r.name as string);
  return Array.from(new Set([...DEFAULT_STATUSES, ...custom]));
};

export const addStatus = async (name: string): Promise<boolean> => {
  const userId = await resolveUserId();
  const clean = name.trim();
  if (!userId || !clean || getViewAsUserId()) return false;
  const { error } = await supabase.from("student_statuses").insert({ user_id: userId, name: clean });
  return !error;
};

// ===== الأعمدة الإضافية =====
export const loadCustomColumns = async (): Promise<CustomColumn[]> => {
  const userId = await resolveUserId();
  if (!userId) return [];
  const { data } = await supabase
    .from("student_columns")
    .select("id,key,label,col_type,sort_order")
    .eq("user_id", userId)
    .order("sort_order");
  return (data || []) as CustomColumn[];
};

export const addCustomColumn = async (
  label: string,
  colType: "text" | "number" | "date",
  sortOrder: number
): Promise<boolean> => {
  const userId = await resolveUserId();
  const clean = label.trim();
  if (!userId || !clean || getViewAsUserId()) return false;
  const key = `c_${Date.now().toString(36)}`;
  const { error } = await supabase
    .from("student_columns")
    .insert({ user_id: userId, key, label: clean, col_type: colType, sort_order: sortOrder });
  if (error) console.error("addCustomColumn failed:", error);
  return !error;
};

export const deleteCustomColumn = async (id: string): Promise<boolean> => {
  const userId = await resolveUserId();
  if (!userId || getViewAsUserId()) return false;
  const { error } = await supabase.from("student_columns").delete().eq("id", id).eq("user_id", userId);
  return !error;
};

// ===== أعوام الطالب =====
export const listStudentYears = async (studentId: number): Promise<string[]> => {
  const userId = await resolveUserId();
  if (!userId) return [];
  const { data } = await supabase
    .from("year_data")
    .select("year")
    .eq("user_id", userId)
    .eq("student_id", studentId)
    .order("year");
  return Array.from(new Set((data || []).map((r: any) => r.year as string)));
};
