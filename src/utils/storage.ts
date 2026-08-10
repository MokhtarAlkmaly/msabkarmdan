import { Student, HifzHistory, YearData, START_YEAR } from "@/types/student";
import { supabase } from "@/integrations/supabase/client";
import {
  cacheStudents, getCachedStudents, putCachedStudent, deleteCachedStudent,
  cacheHifzHistory, getCachedHifzHistory, putCachedHifzRow,
  cacheYearData, getCachedYearData, putCachedYearData,
  setCachedSetting, getCachedSetting,
  setLastSyncTime, isCachePopulated, clearAllCache,
  CachedStudent, CachedHifzRow, CachedYearData,
} from "./localDB";
import {
  markDirty, getPendingChanges, clearPending, clearAllPending,
  remapPendingStudentId,
} from "./localDB";

// ===== Helper: get cached user =====
let cachedUserId: string | null = null;
let knownUserId: string | null = null;

// ===== Admin "view as center" mode (read-only) =====
const VIEW_AS_KEY = 'viewAsUserId';

export const getViewAsUserId = (): string | null => {
  try { return localStorage.getItem(VIEW_AS_KEY); } catch { return null; }
};

export const isViewingOtherCenter = (): boolean => !!getViewAsUserId();

export const setViewAsUserId = async (userId: string | null) => {
  try {
    if (userId) localStorage.setItem(VIEW_AS_KEY, userId);
    else localStorage.removeItem(VIEW_AS_KEY);
  } catch { /* ignore */ }
  await clearAllCache().catch(console.error);
};

const getUserId = async (): Promise<string | null> => {
  const viewAs = getViewAsUserId();
  if (viewAs) return viewAs;
  if (cachedUserId) return cachedUserId;
  const { data: { user } } = await supabase.auth.getUser();
  cachedUserId = user?.id || null;
  if (cachedUserId) knownUserId = cachedUserId;
  return cachedUserId;
};

// Only wipe the local cache when the *identity* actually changes (sign out, or a
// different account signs in). Token refreshes / tab focus events must never
// destroy unsynced local data.
supabase.auth.onAuthStateChange((event, session) => {
  const newUserId = session?.user?.id || null;
  cachedUserId = newUserId;

  const identityChanged = knownUserId !== null && newUserId !== null && knownUserId !== newUserId;
  const signedOut = event === 'SIGNED_OUT';

  if (newUserId) knownUserId = newUserId;

  if (signedOut || identityChanged) {
    knownUserId = newUserId;
    clearAllCache().catch(console.error);
  }
});

// ===== Online check =====
const isOnline = () => navigator.onLine;

// ===== Initial sync: download all data from cloud to local =====
export type ProgressCb = (current: number, total: number, label?: string) => void;

export const syncFromCloud = async (onProgress?: ProgressCb): Promise<boolean> => {
  const userId = await getUserId();
  if (!userId || !isOnline()) return false;

  try {
    // Never overwrite local data that hasn't been uploaded yet — push first.
    const pendingBefore = await getPendingChanges();
    if (pendingBefore.length > 0) {
      const pushed = await syncToCloud();
      if (!pushed) return false;
    }

    onProgress?.(0, 4, 'تحميل الطالبات');
    const [studentsRes, historyRes, yearDataRes] = await Promise.all([
      supabase.from('students').select('*').eq('user_id', userId).order('id'),
      supabase.from('hifz_history').select('*').eq('user_id', userId),
      supabase.from('year_data').select('*').eq('user_id', userId),
    ]);

    if (studentsRes.error) throw studentsRes.error;

    onProgress?.(1, 4, 'حفظ الطالبات');
    await cacheStudents(
      (studentsRes.data || []).map(s => ({ id: s.id, name: s.name, teacher: s.teacher, user_id: s.user_id }))
    );

    onProgress?.(2, 4, 'حفظ سجل الحفظ');
    await cacheHifzHistory(
      (historyRes.data || []).map(r => ({ student_id: r.student_id, year_key: r.year_key, value: r.value }))
    );

    onProgress?.(3, 4, 'حفظ بيانات الأعوام');
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
    if (settingsData?.active_year) {
      await setCachedSetting('active_year', settingsData.active_year);
    }

    await setLastSyncTime();
    onProgress?.(4, 4, 'اكتمل');
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

  // Derive history from year_data.parts for ALL years (not just immediately previous).
  // This ensures cumulative "previous hifz" reflects every prior year a student had parts in.
  allYearData.forEach(row => {
    const parts = parseFloat(row.parts) || 0;
    if (parts <= 0) return;
    if (!historyMap[row.student_id]) historyMap[row.student_id] = {};
    const key = `h${row.year}`;
    const existing = parseFloat(historyMap[row.student_id][key]) || 0;
    if (parts > existing) {
      historyMap[row.student_id][key] = parts.toString();
    }
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
    await markDirty('student', 'upsert', { id: student.id });
    return student.id;
  } else {
    // Temporary ID in a high range so it can never collide with a real cloud id
    // (cloud ids come from a normal sequence). Remapped on first successful sync.
    const TEMP_BASE = 1_000_000_000;
    const existing = await getCachedStudents();
    const maxId = existing.reduce((max, s) => Math.max(max, s.id), TEMP_BASE);
    const newId = maxId + 1;
    await putCachedStudent({ id: newId, name: student.name, teacher: student.teacher, user_id: userId });
    await markDirty('student', 'upsert', { id: newId });
    return newId;
  }
};

export const deleteStudent = async (id: number) => {
  await deleteCachedStudent(id);
  await markDirty('student', 'delete', { id });
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
  const { clearAllPending } = await import("./localDB");

  // Try to wipe cloud first if online & authenticated
  const userId = await getUserId();
  if (userId && isOnline()) {
    try {
      await Promise.all([
        supabase.from('hifz_history').delete().eq('user_id', userId),
        supabase.from('year_data').delete().eq('user_id', userId),
      ]);
      await supabase.from('students').delete().eq('user_id', userId);
    } catch (err) {
      console.error('Cloud wipe failed:', err);
    }
  } else {
    // Offline: queue student deletes so next sync removes them
    const existing = await getCachedStudents();
    for (const s of existing) {
      await markDirty('student', 'delete', { id: s.id });
    }
  }

  await clearStore('students');
  await clearStore('hifz_history');
  await clearStore('year_data');
  // If we wiped cloud successfully, drop any stale pending changes
  if (userId && isOnline()) {
    await clearAllPending();
  }
};

export const saveHifzHistory = async (studentId: number, history: HifzHistory) => {
  for (const [yearKey, value] of Object.entries(history)) {
    await putCachedHifzRow({ student_id: studentId, year_key: yearKey, value: value || '0' });
    await markDirty('hifz', 'upsert', { student_id: studentId, year_key: yearKey });
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
  await markDirty('year', 'upsert', { student_id: studentId, year });
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

// Latest Hijri year that actually has data; falls back to the first competition year
const getLatestDataYear = async (): Promise<string> => {
  try {
    const cached = await getCachedYearData();
    const cachedYears = cached.map(r => r.year).filter(Boolean);
    if (cachedYears.length) return cachedYears.sort().slice(-1)[0];
  } catch { /* ignore */ }

  const userId = await getUserId();
  if (userId && isOnline()) {
    const { data } = await supabase
      .from('year_data')
      .select('year')
      .eq('user_id', userId)
      .order('year', { ascending: false })
      .limit(1);
    if (data?.[0]?.year) return data[0].year;
  }

  return String(START_YEAR);
};

export const getActiveYear = async (): Promise<string> => {
  const hasCache = await isCachePopulated();
  if (hasCache) {
    const year = await getCachedSetting<string>('active_year');
    if (year) return year;
    return getLatestDataYear();
  }

  // Fallback to cloud
  const userId = await getUserId();
  if (!userId || !isOnline()) return getLatestDataYear();

  const { data } = await supabase
    .from('user_settings')
    .select('active_year')
    .eq('user_id', userId)
    .maybeSingle();

  const year = data?.active_year || (await getLatestDataYear());
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
let syncInFlight: Promise<boolean> | null = null;

export const syncToCloud = async (onProgress?: ProgressCb): Promise<boolean> => {
  // Prevent overlapping syncs (interval + focus + online events) which could
  // insert the same new student twice.
  if (syncInFlight) return syncInFlight;
  syncInFlight = runSyncToCloud(onProgress).finally(() => { syncInFlight = null; });
  return syncInFlight;
};

const runSyncToCloud = async (onProgress?: ProgressCb): Promise<boolean> => {
  const userId = await getUserId();
  if (!userId) return false;
  if (!isOnline()) return false;

  try {
    const pending = await getPendingChanges();
    if (pending.length === 0) {
      onProgress?.(1, 1, 'لا تغييرات');
      await setLastSyncTime();
      return true;
    }

    const students = await getCachedStudents();
    const allHistory = await getCachedHifzHistory();
    const allYearData = await getCachedYearData();

    // Get existing cloud student ids to know which student upserts are inserts vs updates
    const { data: cloudStudents } = await supabase
      .from('students').select('id').eq('user_id', userId);
    const cloudIdSet = new Set((cloudStudents || []).map(s => s.id));

    // Group changes by entity & op
    const studentUpserts = pending.filter(p => p.entity === 'student' && p.op === 'upsert');
    const studentDeletes = pending.filter(p => p.entity === 'student' && p.op === 'delete');
    const hifzUpserts = pending.filter(p => p.entity === 'hifz' && p.op === 'upsert');
    const yearUpserts = pending.filter(p => p.entity === 'year' && p.op === 'upsert');

    const total = pending.length + 1;
    let done = 0;
    const tick = (label?: string) => onProgress?.(++done, total, label);
    let hadError = false;

    // 1) Student deletes
    const deleteIds = studentDeletes.map(p => p.ref.id).filter(id => cloudIdSet.has(id));
    if (deleteIds.length > 0) {
      const { error } = await supabase.from('students').delete().eq('user_id', userId).in('id', deleteIds);
      if (error) { console.error('Delete students failed:', error); hadError = true; }
    }
    if (!hadError) {
      for (const p of studentDeletes) { await clearPending(p.key); tick('حذف الطالبات'); }
    }

    // 2) Student upserts (insert new vs update existing)
    for (const p of studentUpserts) {
      const local = students.find(s => s.id === p.ref.id);
      if (!local) { await clearPending(p.key); tick('رفع الطالبات'); continue; }

      if (cloudIdSet.has(local.id)) {
        const { error } = await supabase.from('students')
          .update({ name: local.name, teacher: local.teacher })
          .eq('id', local.id).eq('user_id', userId);
        if (error) { console.error('Update student failed:', error); hadError = true; tick('رفع الطالبات'); continue; }
      } else {
        const { data: inserted, error } = await supabase.from('students')
          .insert({ name: local.name, teacher: local.teacher, user_id: userId })
          .select('id').single();
        if (error || !inserted) {
          console.error('Insert student failed:', error);
          hadError = true;
          tick('رفع الطالبات');
          continue;
        }
        if (inserted.id !== local.id) {
          const oldId = local.id;
          const newId = inserted.id;
          // Update local caches
          await deleteCachedStudent(oldId);
          await putCachedStudent({ id: newId, name: local.name, teacher: local.teacher, user_id: userId });
          local.id = newId;
          // Move related history & year_data rows to new id locally
          const { deleteItem, putItem } = await import("./localDB");
          for (const h of allHistory.filter(r => r.student_id === oldId)) {
            await deleteItem('hifz_history', [oldId, h.year_key]);
            h.student_id = newId;
            await putItem('hifz_history', h);
          }
          for (const y of allYearData.filter(r => r.student_id === oldId)) {
            await deleteItem('year_data', [oldId, y.year]);
            y.student_id = newId;
            await putItem('year_data', y);
          }
          await remapPendingStudentId(oldId, newId);
          cloudIdSet.add(newId);
        } else {
          cloudIdSet.add(inserted.id);
        }
      }
      await clearPending(p.key);
      tick('رفع الطالبات');
    }

    // Refresh pending after potential remap
    const pendingAfter = await getPendingChanges();
    const hifzPending = pendingAfter.filter(p => p.entity === 'hifz' && p.op === 'upsert');
    const yearPending = pendingAfter.filter(p => p.entity === 'year' && p.op === 'upsert');

    // 3) Hifz upserts
    if (hifzPending.length > 0) {
      const rows = hifzPending.map(p => {
        const r = allHistory.find(h => h.student_id === p.ref.student_id && h.year_key === p.ref.year_key);
        return r ? { student_id: r.student_id, user_id: userId, year_key: r.year_key, value: r.value || '0' } : null;
      }).filter(Boolean) as any[];
      let hifzOk = true;
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        const { error } = await supabase.from('hifz_history').upsert(chunk, { onConflict: 'student_id,year_key' });
        if (error) { console.error('Hifz upsert failed:', error); hifzOk = false; hadError = true; break; }
      }
      if (hifzOk) {
        for (const p of hifzPending) { await clearPending(p.key); tick('رفع سجل الحفظ'); }
      }
    }

    // 4) Year data upserts
    if (yearPending.length > 0) {
      const rows = yearPending.map(p => {
        const r = allYearData.find(y => y.student_id === p.ref.student_id && y.year === p.ref.year);
        return r ? {
          student_id: r.student_id, user_id: userId, year: r.year,
          base_hifz: r.base_hifz, total_hifz: r.total_hifz, parts: r.parts,
          annual: r.annual, recitation: r.recitation, memorization: r.memorization,
          total: r.total, grade: r.grade, prize: r.prize,
          status_prize: r.status_prize, rank: r.rank, teacher: r.teacher || '',
        } : null;
      }).filter(Boolean) as any[];
      let yearOk = true;
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        const { error } = await supabase.from('year_data').upsert(chunk, { onConflict: 'student_id,year' });
        if (error) { console.error('Year data upsert failed:', error); yearOk = false; hadError = true; break; }
      }
      if (yearOk) {
        for (const p of yearPending) { await clearPending(p.key); tick('رفع بيانات الأعوام'); }
      }
    }

    await setLastSyncTime();
    tick('اكتمل');
    return !hadError;
  } catch (err) {
    console.error('Sync to cloud failed:', err);
    return false;
  }
};

// Legacy sync-compatible wrappers (for ImportExport component)
export const saveGlobalStudents = async (students: Student[]) => {
  // handled per-student via saveStudent
};

// ===== Merge duplicate students by name (case-insensitive, trimmed) =====
export const mergeDuplicateStudents = async (): Promise<number> => {
  const students = await getCachedStudents();
  const allHistory = await getCachedHifzHistory();
  const allYearData = await getCachedYearData();

  const norm = (s: string) => (s || '').trim().replace(/\s+/g, ' ');
  const groups: Record<string, typeof students> = {};
  for (const s of students) {
    const key = norm(s.name);
    if (!key) continue;
    (groups[key] = groups[key] || []).push(s);
  }

  const { putCachedHifzRow, putCachedYearData, deleteItem } = await import("./localDB");
  let mergedCount = 0;

  for (const key in groups) {
    const group = groups[key];
    if (group.length < 2) continue;
    // Keep the one with the smallest id as primary
    group.sort((a, b) => a.id - b.id);
    const primary = group[0];
    const dupes = group.slice(1);

    for (const dup of dupes) {
      // Move hifz history (don't overwrite existing primary keys with empty values)
      const dupHistory = allHistory.filter(h => h.student_id === dup.id);
      for (const h of dupHistory) {
        const existing = allHistory.find(r => r.student_id === primary.id && r.year_key === h.year_key);
        if (!existing || !existing.value || existing.value === '0') {
          await putCachedHifzRow({ student_id: primary.id, year_key: h.year_key, value: h.value });
          await markDirty('hifz', 'upsert', { student_id: primary.id, year_key: h.year_key });
        }
        await deleteItem('hifz_history', [h.student_id, h.year_key]);
      }
      // Move year data
      const dupYears = allYearData.filter(y => y.student_id === dup.id);
      for (const y of dupYears) {
        const existing = allYearData.find(r => r.student_id === primary.id && r.year === y.year);
        if (!existing || (!existing.parts && existing.total === '0')) {
          await putCachedYearData({ ...y, student_id: primary.id });
          await markDirty('year', 'upsert', { student_id: primary.id, year: y.year });
        }
        await deleteItem('year_data', [y.student_id, y.year]);
      }
      // Delete duplicate student
      const { deleteCachedStudent } = await import("./localDB");
      await deleteCachedStudent(dup.id);
      await markDirty('student', 'delete', { id: dup.id });
      mergedCount++;
    }
  }

  return mergedCount;
};
