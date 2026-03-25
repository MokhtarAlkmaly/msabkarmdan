import { Student, HifzHistory, YearData } from "@/types/student";
import { supabase } from "@/integrations/supabase/client";

// ===== Supabase-based storage functions =====

export const loadGlobalStudents = async (): Promise<Student[]> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('students')
    .select('*')
    .eq('user_id', user.id)
    .order('id');

  if (error) {
    console.error('Error loading students:', error);
    return [];
  }

  return data.map(s => ({ id: s.id, name: s.name, teacher: s.teacher }));
};

export const saveStudent = async (student: { id?: number; name: string; teacher: string }): Promise<number | null> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  if (student.id) {
    await supabase
      .from('students')
      .update({ name: student.name, teacher: student.teacher })
      .eq('id', student.id)
      .eq('user_id', user.id);
    return student.id;
  } else {
    const { data, error } = await supabase
      .from('students')
      .insert({ name: student.name, teacher: student.teacher, user_id: user.id })
      .select('id')
      .single();
    if (error) { console.error(error); return null; }
    return data.id;
  }
};

export const deleteStudent = async (id: number) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from('students').delete().eq('id', id).eq('user_id', user.id);
};

export const deleteAllStudents = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from('students').delete().eq('user_id', user.id);
};

export const loadHifzHistory = async (studentId: number): Promise<HifzHistory> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return {};

  const { data, error } = await supabase
    .from('hifz_history')
    .select('year_key, value')
    .eq('student_id', studentId)
    .eq('user_id', user.id);

  if (error) { console.error(error); return {}; }

  const history: HifzHistory = {};
  data.forEach(row => { history[row.year_key] = row.value; });
  return history;
};

export const saveHifzHistory = async (studentId: number, history: HifzHistory) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  for (const [yearKey, value] of Object.entries(history)) {
    await supabase
      .from('hifz_history')
      .upsert(
        { student_id: studentId, user_id: user.id, year_key: yearKey, value: value || '0' },
        { onConflict: 'student_id,year_key' }
      );
  }
};

export const loadYearData = async (year: string, studentId: number): Promise<YearData> => {
  const defaultData: YearData = {
    baseHifz: '0', totalHifz: '0', parts: '', annual: '', recitation: '',
    memorization: '', total: '0', grade: '', prize: '0', statusPrize: '', rank: '-'
  };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return defaultData;

  const { data, error } = await supabase
    .from('year_data')
    .select('*')
    .eq('student_id', studentId)
    .eq('year', year)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error || !data) return defaultData;

  return {
    baseHifz: data.base_hifz,
    totalHifz: data.total_hifz,
    parts: data.parts,
    annual: data.annual,
    recitation: data.recitation,
    memorization: data.memorization,
    total: data.total,
    grade: data.grade,
    prize: data.prize,
    statusPrize: data.status_prize,
    rank: data.rank,
  };
};

export const saveYearData = async (year: string, studentId: number, data: YearData) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from('year_data')
    .upsert({
      student_id: studentId,
      user_id: user.id,
      year,
      base_hifz: data.baseHifz,
      total_hifz: data.totalHifz,
      parts: data.parts,
      annual: data.annual,
      recitation: data.recitation,
      memorization: data.memorization,
      total: data.total,
      grade: data.grade,
      prize: data.prize,
      status_prize: data.statusPrize,
      rank: data.rank,
    }, { onConflict: 'student_id,year' });
};

export const getActiveYear = async (): Promise<string> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return '1447';

  const { data } = await supabase
    .from('user_settings')
    .select('active_year')
    .eq('user_id', user.id)
    .maybeSingle();

  return data?.active_year || '1447';
};

export const setActiveYear = async (year: string) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from('user_settings')
    .upsert({ user_id: user.id, active_year: year }, { onConflict: 'user_id' });
};

export const migrateYearData = async (newYear: string, students: { id: number }[]) => {
  const newYearNum = parseInt(newYear);
  const previousYear = newYearNum - 1;

  for (const student of students) {
    const history = await loadHifzHistory(student.id);
    const previousYearData = await loadYearData(previousYear.toString(), student.id);

    const previousParts = parseFloat(previousYearData.parts) || 0;
    if (previousParts > 0) {
      const historyKey = `h${previousYear}`;
      history[historyKey] = previousParts.toString();
      await saveHifzHistory(student.id, history);
    }
  }
};

// Legacy sync-compatible wrappers (for ImportExport component)
export const saveGlobalStudents = async (students: Student[]) => {
  // This is handled per-student now via saveStudent
};
