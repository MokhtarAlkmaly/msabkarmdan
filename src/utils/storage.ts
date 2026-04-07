import { Student, HifzHistory, YearData } from "@/types/student";
import { supabase } from "@/integrations/supabase/client";
import {
  cacheStudents, getCachedStudents, putCachedStudent, deleteCachedStudent,
  cacheHifzHistory, getCachedHifzHistory, putCachedHifzRow,
  cacheYearData, getCachedYearData, putCachedYearData,
  setCachedSetting, getCachedSetting,
  setLastSyncTime, isCachePopulated, clearAllCache,
  CachedStudent, CachedHifzRow, CachedYearData,
} from "./localDB";

// ===== Helper: get cached user =====
let cachedUserId: string | null = null;

const getUserId = async (): Promise<string | null> => {
  if (cachedUserId) return cachedUserId;
  const { data: { user } } = await supabase.auth.getUser();
  cachedUserId = user?.id || null;
  return cachedUserId;
};

supabase.auth.onAuthStateChange(() => {
  cachedUserId = null;
  // Clear local cache on auth change (logout/login)
  clearAllCache().catch(console.error);
});

// ===== Online check =====
const isOnline = () => navigator.onLine;

// ===== Initial sync: download all data from cloud to local =====
export const syncFromCloud = async (): Promise<boolean> => {
  const userId = await getUserId();
  if (!userId || !isOnline()) return false;

  try {
    const [studentsRes, historyRes, yearDataRes] = await Promise.all([
      supabase.from('students').select('*').eq('user_id', userId).order('id'),
      supabase.from('hifz_history').select('*').eq('user_id', userId),
      supabase.from('year_data').select('*').eq('user_id', userId),
    ]);

    if (studentsRes.error) throw studentsRes.error;

    // Cache students
    await cacheStudents(
      (studentsRes.data || []).map(s => ({ id: s.id, name: s.name, teacher: s.teacher, user_id: s.user_id }))
    );

    // Cache hifz history
    await cacheHifzHistory(
      (historyRes.data || []).map(r => ({ student_id: r.student_id, year_key: r.year_key, value: r.value }))
    );

    // Cache year data (all years)
    await cacheYearData(
      (yearDataRes.data || []).map(r => ({
        student_id: r.student_id, year: r.year,
        base_hifz: r.base_hifz, total_hifz: r.total_hifz, parts: r.parts,
        annual: r.annual, recitation: r.recitation, memorization: r.memorization,
        total: r.total, grade: r.grade, prize: r.prize,
        status_prize: r.status_prize, rank: r.rank, teacher: (r as any).teacher || '',
      }))
    );

    // Cache active year
    const { data: settingsData } = await supabase
      .from('user_settings')
      .select('active_year')
      .eq('user_id', userId)
      .maybeSingle();
    await setCachedSetting('active_year', settingsData?.active_year || '1447');

    await setLastSyncTime();
    return true;
  } catch (err) {
    console.error('Sync from cloud failed:', err);
    return false;
  }
};

// ===== Load students with data from LOCAL cache =====
export const loadAllStudentsWithData = async (currentYear: string): Promise<Student[]> => {
  const hasCache = await isCachePopulated();
  if (!hasCache) {
    await syncFromCloud();
  }

  const students = await getCachedStudents();
  const allHistory = await getCachedHifzHistory();
  const allYearData = await getCachedYearData();

  const historyMap: Record<number, HifzHistory> = {};
  allHistory.forEach(row => {
    if (!historyMap[row.student_id]) historyMap[row.student_id] = {};
    historyMap[row.student_id][row.year_key] = row.value;
  });

  const yearDataMap: Record<number, YearData> = {};
  allYearData
    .filter(r => r.year === currentYear)
    .forEach(row => {
      yearDataMap[row.student_id] = {
        baseHifz: row.base_hifz, totalHifz: row.total_hifz, parts: row.parts,
        annual: row.annual, recitation: row.recitation, memorization: row.memorization,
        total: row.total, grade: row.grade, prize: row.prize,
        statusPrize: row.status_prize, rank: row.rank, teacher: row.teacher || '',
      };
    });

  const defaultYearData: YearData = {
    baseHifz: '0', totalHifz: '0', parts: '', annual: '', recitation: '',
    memorization: '', total: '0', grade: '', prize: '0', statusPrize: '', rank: '-',
    teacher: ''
  };

  return students.map(s => ({
    id: s.id,
    name: s.name,
    teacher: yearDataMap[s.id]?.teacher || s.teacher || '',
    hifzHistory: historyMap[s.id] || {},
    yearData: yearDataMap[s.id] || { ...defaultYearData },
  }));
};

export const loadGlobalStudents = async (): Promise<Student[]> => {
  const students = await getCachedStudents();
  return students.map(s => ({ id: s.id, name: s.name, teacher: s.teacher }));
};

// ===== Save to LOCAL cache only (not cloud) =====
export const saveStudent = async (student: { id?: number; name: string; teacher: string }): Promise<number | null> => {
  const userId = await getUserId();
  if (!userId) return null;

  if (student.id) {
    await putCachedStudent({ id: student.id, name: student.name, teacher: student.teacher, user_id: userId });
    return student.id;
  } else {
    // Generate a temporary ID for new students
    const existing = await getCachedStudents();
    const maxId = existing.reduce((max, s) => Math.max(max, s.id), 0);
    const newId = maxId + 1;
    await putCachedStudent({ id: newId, name: student.name, teacher: student.teacher, user_id: userId });
    return newId;
  }
};

export const deleteStudent = async (id: number) => {
  await deleteCachedStudent(id);
  // Also delete related cache
  const allHistory = await getCachedHifzHistory();
  const allYearData = await getCachedYearData();
  for (const row of allHistory.filter(r => r.student_id === id)) {
    const { deleteItem } = await import("./localDB");
    await deleteItem('hifz_history', [row.student_id, row.year_key]);
  }
  for (const row of allYearData.filter(r => r.student_id === id)) {
    const { deleteItem } = await import("./localDB");
    await deleteItem('year_data', [row.student_id, row.year]);
  }
};

export const deleteAllStudents = async () => {
  const { clearStore } = await import("./localDB");
  await clearStore('students');
  await clearStore('hifz_history');
  await clearStore('year_data');
};

export const saveHifzHistory = async (studentId: number, history: HifzHistory) => {
  for (const [yearKey, value] of Object.entries(history)) {
    await putCachedHifzRow({ student_id: studentId, year_key: yearKey, value: value || '0' });
  }
};

export const loadHifzHistory = async (studentId: number): Promise<HifzHistory> => {
  const allHistory = await getCachedHifzHistory();
  const history: HifzHistory = {};
  allHistory.filter(r => r.student_id === studentId).forEach(r => {
    history[r.year_key] = r.value;
  });
  return history;
};

export const saveYearData = async (year: string, studentId: number, data: YearData) => {
  await putCachedYearData({
    student_id: studentId, year,
    base_hifz: data.baseHifz, total_hifz: data.totalHifz, parts: data.parts,
    annual: data.annual, recitation: data.recitation, memorization: data.memorization,
    total: data.total, grade: data.grade, prize: data.prize,
    status_prize: data.statusPrize, rank: data.rank, teacher: data.teacher || '',
  });
};

export const loadYearData = async (year: string, studentId: number): Promise<YearData> => {
  const defaultData: YearData = {
    baseHifz: '0', totalHifz: '0', parts: '', annual: '', recitation: '',
    memorization: '', total: '0', grade: '', prize: '0', statusPrize: '', rank: '-',
    teacher: ''
  };

  const allYearData = await getCachedYearData();
  const row = allYearData.find(r => r.student_id === studentId && r.year === year);
  if (!row) return defaultData;

  return {
    baseHifz: row.base_hifz, totalHifz: row.total_hifz, parts: row.parts,
    annual: row.annual, recitation: row.recitation, memorization: row.memorization,
    total: row.total, grade: row.grade, prize: row.prize,
    statusPrize: row.status_prize, rank: row.rank, teacher: row.teacher || '',
  };
};

export const getActiveYear = async (): Promise<string> => {
  const hasCache = await isCachePopulated();
  if (hasCache) {
    const year = await getCachedSetting<string>('active_year');
    return year || '1447';
  }

  // Fallback to cloud
  const userId = await getUserId();
  if (!userId || !isOnline()) return '1447';

  const { data } = await supabase
    .from('user_settings')
    .select('active_year')
    .eq('user_id', userId)
    .maybeSingle();

  const year = data?.active_year || '1447';
  await setCachedSetting('active_year', year);
  return year;
};

export const setActiveYear = async (year: string) => {
  await setCachedSetting('active_year', year);
  // Also save to cloud if online
  const userId = await getUserId();
  if (userId && isOnline()) {
    await supabase
      .from('user_settings')
      .upsert({ user_id: userId, active_year: year }, { onConflict: 'user_id' });
  }
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

// ===== SYNC TO CLOUD: called when user clicks "Save" =====
export const syncToCloud = async (): Promise<boolean> => {
  const userId = await getUserId();
  if (!userId) return false;
  if (!isOnline()) return false;

  try {
    const students = await getCachedStudents();
    const allHistory = await getCachedHifzHistory();
    const allYearData = await getCachedYearData();

    // 1. Sync students - delete all and re-insert
    // First get existing cloud students to find ones to delete
    const { data: cloudStudents } = await supabase
      .from('students')
      .select('id')
      .eq('user_id', userId);

    const localIds = new Set(students.map(s => s.id));
    const cloudIds = (cloudStudents || []).map(s => s.id);
    
    // Delete students that are in cloud but not local
    const toDelete = cloudIds.filter(id => !localIds.has(id));
    if (toDelete.length > 0) {
      await supabase.from('students').delete().eq('user_id', userId).in('id', toDelete);
    }

    // Upsert all local students
    if (students.length > 0) {
      // For students with temp IDs (not in cloud), we need to insert them
      // For existing ones, update
      for (const s of students) {
        const { data: existing } = await supabase
          .from('students')
          .select('id')
          .eq('id', s.id)
          .eq('user_id', userId)
          .maybeSingle();

        if (existing) {
          await supabase.from('students')
            .update({ name: s.name, teacher: s.teacher })
            .eq('id', s.id)
            .eq('user_id', userId);
        } else {
          const { data: newStudent } = await supabase.from('students')
            .insert({ name: s.name, teacher: s.teacher, user_id: userId })
            .select('id')
            .single();
          
          if (newStudent) {
            // Update local cache and related data with new ID
            const oldId = s.id;
            const newId = newStudent.id;
            
            // Update history references
            for (const h of allHistory.filter(r => r.student_id === oldId)) {
              h.student_id = newId;
            }
            // Update year data references
            for (const y of allYearData.filter(r => r.student_id === oldId)) {
              y.student_id = newId;
            }
            s.id = newId;
          }
        }
      }
    }

    // 2. Sync hifz history
    // Delete all and re-insert
    await supabase.from('hifz_history').delete().eq('user_id', userId);
    if (allHistory.length > 0) {
      const historyRows = allHistory.map(h => ({
        student_id: h.student_id,
        user_id: userId,
        year_key: h.year_key,
        value: h.value || '0',
      }));
      // Batch in chunks of 500
      for (let i = 0; i < historyRows.length; i += 500) {
        await supabase.from('hifz_history').upsert(
          historyRows.slice(i, i + 500),
          { onConflict: 'student_id,year_key' }
        );
      }
    }

    // 3. Sync year data
    await supabase.from('year_data').delete().eq('user_id', userId);
    if (allYearData.length > 0) {
      const yearRows = allYearData.map(r => ({
        student_id: r.student_id, user_id: userId, year: r.year,
        base_hifz: r.base_hifz, total_hifz: r.total_hifz, parts: r.parts,
        annual: r.annual, recitation: r.recitation, memorization: r.memorization,
        total: r.total, grade: r.grade, prize: r.prize,
        status_prize: r.status_prize, rank: r.rank, teacher: r.teacher || '',
      }));
      for (let i = 0; i < yearRows.length; i += 500) {
        await supabase.from('year_data').upsert(
          yearRows.slice(i, i + 500),
          { onConflict: 'student_id,year' }
        );
      }
    }

    // Re-sync from cloud to get correct IDs
    await syncFromCloud();
    await setLastSyncTime();
    return true;
  } catch (err) {
    console.error('Sync to cloud failed:', err);
    return false;
  }
};

// Legacy sync-compatible wrappers (for ImportExport component)
export const saveGlobalStudents = async (students: Student[]) => {
  // handled per-student via saveStudent
};
