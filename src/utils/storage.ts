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
import { writeJsonFile, readJsonFile } from "./fileStorage";

// ===== Helper: get cached user (optional - may be null for local-only mode) =====
let cachedUserId: string | null = null;

const getUserId = async (): Promise<string | null> => {
  if (cachedUserId) return cachedUserId;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    cachedUserId = user?.id || null;
  } catch {
    cachedUserId = null;
  }
  return cachedUserId;
};

// Use a fixed local user ID when not logged in
const getLocalUserId = () => 'local-user';

const getEffectiveUserId = async (): Promise<string> => {
  const cloudId = await getUserId();
  return cloudId || getLocalUserId();
};

supabase.auth.onAuthStateChange(() => {
  cachedUserId = null;
});

// ===== Online check =====
const isOnline = () => navigator.onLine;

const isLoggedIn = async () => {
  const userId = await getUserId();
  return userId !== null;
};

// ===== Persist to filesystem (backup) =====
const persistToFilesystem = async () => {
  try {
    const students = await getCachedStudents();
    const history = await getCachedHifzHistory();
    const yearData = await getCachedYearData();
    const activeYear = await getCachedSetting<string>('active_year');

    await writeJsonFile('students', students);
    await writeJsonFile('hifz_history', history);
    await writeJsonFile('year_data', yearData);
    await writeJsonFile('settings', { active_year: activeYear || '1447' });
  } catch (err) {
    console.error('Filesystem persist failed:', err);
  }
};

// ===== Restore from filesystem if IndexedDB is empty =====
const restoreFromFilesystem = async (): Promise<boolean> => {
  try {
    const students = await readJsonFile<CachedStudent[]>('students');
    if (!students || students.length === 0) return false;

    await cacheStudents(students);

    const history = await readJsonFile<CachedHifzRow[]>('hifz_history');
    if (history) await cacheHifzHistory(history);

    const yearData = await readJsonFile<CachedYearData[]>('year_data');
    if (yearData) await cacheYearData(yearData);

    const settings = await readJsonFile<{ active_year: string }>('settings');
    if (settings) await setCachedSetting('active_year', settings.active_year);

    await setLastSyncTime();
    return true;
  } catch (err) {
    console.error('Filesystem restore failed:', err);
    return false;
  }
};

// ===== Initial sync: download all data from cloud to local =====
export const syncFromCloud = async (onProgress?: (current: number, total: number, stage: string) => void): Promise<boolean> => {
  const userId = await getUserId();
  if (!userId || !isOnline()) return false;

  try {
    onProgress?.(0, 4, 'جارٍ تحميل الطالبات...');
    const [studentsRes, historyRes, yearDataRes] = await Promise.all([
      supabase.from('students').select('*').eq('user_id', userId).order('id'),
      supabase.from('hifz_history').select('*').eq('user_id', userId),
      supabase.from('year_data').select('*').eq('user_id', userId),
    ]);

    if (studentsRes.error) throw studentsRes.error;

    onProgress?.(1, 4, 'جارٍ حفظ الطالبات محلياً...');
    await cacheStudents(
      (studentsRes.data || []).map(s => ({ id: s.id, name: s.name, teacher: s.teacher, user_id: s.user_id }))
    );

    onProgress?.(2, 4, 'جارٍ حفظ سجل الحفظ...');
    await cacheHifzHistory(
      (historyRes.data || []).map(r => ({ student_id: r.student_id, year_key: r.year_key, value: r.value }))
    );

    onProgress?.(3, 4, 'جارٍ حفظ بيانات السنوات...');
    await cacheYearData(
      (yearDataRes.data || []).map(r => ({
        student_id: r.student_id, year: r.year,
        base_hifz: r.base_hifz, total_hifz: r.total_hifz, parts: r.parts,
        annual: r.annual, recitation: r.recitation, memorization: r.memorization,
        total: r.total, grade: r.grade, prize: r.prize,
        status_prize: r.status_prize, rank: r.rank, teacher: (r as any).teacher || '',
      }))
    );

    const { data: settingsData } = await supabase
      .from('user_settings')
      .select('active_year')
      .eq('user_id', userId)
      .maybeSingle();
    await setCachedSetting('active_year', settingsData?.active_year || '1447');

    onProgress?.(4, 4, 'تمت المزامنة!');
    await setLastSyncTime();
    await persistToFilesystem();
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
    // Try filesystem first
    const restored = await restoreFromFilesystem();
    if (!restored) {
      // Try cloud if logged in
      const loggedIn = await isLoggedIn();
      if (loggedIn && isOnline()) {
        await syncFromCloud();
      }
    }
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
  const userId = await getEffectiveUserId();

  if (student.id) {
    await putCachedStudent({ id: student.id, name: student.name, teacher: student.teacher, user_id: userId });
    return student.id;
  } else {
    const existing = await getCachedStudents();
    const maxId = existing.reduce((max, s) => Math.max(max, s.id), 0);
    const newId = maxId + 1;
    await putCachedStudent({ id: newId, name: student.name, teacher: student.teacher, user_id: userId });
    return newId;
  }
};

export const deleteStudent = async (id: number) => {
  await deleteCachedStudent(id);
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
  // Also clear filesystem
  await writeJsonFile('students', []);
  await writeJsonFile('hifz_history', []);
  await writeJsonFile('year_data', []);
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

  // Try filesystem
  const settings = await readJsonFile<{ active_year: string }>('settings');
  if (settings?.active_year) {
    await setCachedSetting('active_year', settings.active_year);
    return settings.active_year;
  }

  // Try cloud if logged in
  const userId = await getUserId();
  if (userId && isOnline()) {
    const { data } = await supabase
      .from('user_settings')
      .select('active_year')
      .eq('user_id', userId)
      .maybeSingle();

    const year = data?.active_year || '1447';
    await setCachedSetting('active_year', year);
    return year;
  }

  return '1447';
};

export const setActiveYear = async (year: string) => {
  await setCachedSetting('active_year', year);
  await writeJsonFile('settings', { active_year: year });

  // Also save to cloud if logged in
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

// ===== Save locally + persist to filesystem =====
export const saveAndPersist = async () => {
  await persistToFilesystem();
};

// ===== SYNC TO CLOUD: called when user clicks cloud sync =====
export const syncToCloud = async (onProgress?: (current: number, total: number, stage: string) => void): Promise<boolean> => {
  const userId = await getUserId();
  if (!userId) return false;
  if (!isOnline()) return false;

  try {
    const students = await getCachedStudents();
    const allHistory = await getCachedHifzHistory();
    const allYearData = await getCachedYearData();
    const totalSteps = 6;

    onProgress?.(0, totalSteps, 'جارٍ تجهيز البيانات...');

    onProgress?.(1, totalSteps, 'تنظيف البيانات القديمة...');
    await Promise.all([
      supabase.from('hifz_history').delete().eq('user_id', userId),
      supabase.from('year_data').delete().eq('user_id', userId),
    ]);
    await supabase.from('students').delete().eq('user_id', userId);

    onProgress?.(2, totalSteps, `إدراج ${students.length} طالبة...`);
    const idMap = new Map<number, number>();

    for (let i = 0; i < students.length; i += 50) {
      const batch = students.slice(i, i + 50);
      const { data: inserted, error } = await supabase.from('students')
        .insert(batch.map(s => ({ name: s.name, teacher: s.teacher, user_id: userId })))
        .select('id, name');

      if (error) {
        console.error('Batch insert error:', error);
        continue;
      }

      if (inserted) {
        for (let j = 0; j < batch.length && j < inserted.length; j++) {
          idMap.set(batch[j].id, inserted[j].id);
        }
      }

      onProgress?.(2, totalSteps, `إدراج ${Math.min(i + 50, students.length)} / ${students.length} طالبة...`);
    }

    onProgress?.(3, totalSteps, 'مزامنة سجل الحفظ...');
    if (allHistory.length > 0) {
      const historyRows = allHistory
        .map(h => ({
          student_id: idMap.get(h.student_id) ?? h.student_id,
          user_id: userId,
          year_key: h.year_key,
          value: h.value || '0',
        }))
        .filter(h => idMap.has(h.student_id) || students.some(s => idMap.get(s.id) === h.student_id));

      for (let i = 0; i < historyRows.length; i += 500) {
        await supabase.from('hifz_history').insert(historyRows.slice(i, i + 500));
      }
    }

    onProgress?.(4, totalSteps, 'مزامنة بيانات السنوات...');
    if (allYearData.length > 0) {
      const yearRows = allYearData.map(r => ({
        student_id: idMap.get(r.student_id) ?? r.student_id,
        user_id: userId, year: r.year,
        base_hifz: r.base_hifz, total_hifz: r.total_hifz, parts: r.parts,
        annual: r.annual, recitation: r.recitation, memorization: r.memorization,
        total: r.total, grade: r.grade, prize: r.prize,
        status_prize: r.status_prize, rank: r.rank, teacher: r.teacher || '',
      }));
      for (let i = 0; i < yearRows.length; i += 500) {
        await supabase.from('year_data').insert(yearRows.slice(i, i + 500));
      }
    }

    onProgress?.(5, totalSteps, 'تحديث الذاكرة المحلية...');
    await syncFromCloud();

    onProgress?.(totalSteps, totalSteps, 'تمت المزامنة بنجاح!');
    await setLastSyncTime();
    return true;
  } catch (err) {
    console.error('Sync to cloud failed:', err);
    return false;
  }
};

export const saveGlobalStudents = async (students: Student[]) => {
  // handled per-student via saveStudent
};
