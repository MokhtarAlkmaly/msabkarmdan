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
  markDirty as markDirtyRaw, getPendingChanges, clearPending, clearAllPending,
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

// Never queue local changes for upload while an admin is viewing another
// center (read-only mode) — that data belongs to someone else.
const markDirty: typeof markDirtyRaw = (...args) => {
  if (isViewingOtherCenter()) return Promise.resolve() as ReturnType<typeof markDirtyRaw>;
  return markDirtyRaw(...args);
};

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

  if (isViewingOtherCenter()) return;

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
  const cached = await getCachedHifzHistory();
  for (const [yearKey, value] of Object.entries(history)) {
    const next = value || '0';
    const existing = cached.find(r => r.student_id === studentId && r.year_key === yearKey);
    if (existing && existing.value === next) continue; // nothing changed
    await putCachedHifzRow({ student_id: studentId, year_key: yearKey, value: next });
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
  const row = {
    student_id: studentId, year,
    base_hifz: data.baseHifz, total_hifz: data.totalHifz, parts: data.parts,
    annual: data.annual, recitation: data.recitation, memorization: data.memorization,
    total: data.total, grade: data.grade, prize: data.prize,
    status_prize: data.statusPrize, rank: data.rank, teacher: data.teacher || '',
  };
  const allYearData = await getCachedYearData();
  const existing = allYearData.find(r => r.student_id === studentId && r.year === year);
  if (existing && (Object.keys(row) as (keyof typeof row)[]).every(k => (existing as any)[k] === row[k])) {
    return; // identical to what is already stored — don't mark as unsaved
  }
  await putCachedYearData(row);
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
  // Also save to cloud if online — fire-and-forget so the UI never waits on it
  const userId = await getUserId();
  if (userId && isOnline() && !isViewingOtherCenter()) {
    void supabase
      .from('user_settings')
      .upsert({ user_id: userId, active_year: year }, { onConflict: 'user_id' })
      .then(({ error }) => { if (error) console.error('setActiveYear sync failed:', error); });
  }
};

export const migrateYearData = async (newYear: string, students: { id: number }[]) => {
  const newYearNum = parseInt(newYear);
  const previousYear = newYearNum - 1;
  const historyKey = `h${previousYear}`;

  // Read the local cache ONCE (previously this ran two full IndexedDB scans per
  // student, which made switching years very slow on large lists).
  const [allHistory, allYearData] = await Promise.all([
    getCachedHifzHistory(),
    getCachedYearData(),
  ]);

  const historyValue = new Map<number, string>();
  for (const r of allHistory) {
    if (r.year_key === historyKey) historyValue.set(r.student_id, r.value);
  }

  const prevParts = new Map<number, string>();
  const prevYearStr = previousYear.toString();
  for (const r of allYearData) {
    if (r.year === prevYearStr) prevParts.set(r.student_id, r.parts);
  }

  const writes: Promise<unknown>[] = [];
  for (const student of students) {
    const parts = parseFloat(prevParts.get(student.id) || '') || 0;
    if (parts <= 0) continue;
    const nextValue = parts.toString();
    // Only write (and queue a sync) when the value actually changes, otherwise
    // simply switching years would mark everything as unsaved.
    if ((historyValue.get(student.id) ?? '') === nextValue) continue;
    writes.push(putCachedHifzRow({ student_id: student.id, year_key: historyKey, value: nextValue }));
    writes.push(markDirty('hifz', 'upsert', { student_id: student.id, year_key: historyKey }));
  }
  await Promise.all(writes);
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
  // Admin viewing another center: never write to their data
  if (isViewingOtherCenter()) return false;

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

// ===== توحيد أسماء الطالبات (تجاهل الهمزات والتشكيل والمسافات) =====
export const normalizeArabicName = (s: string) =>
  (s || '')
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '') // تشكيل وتطويل
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ء/g, '')
    .replace(/[^\u0621-\u064Aa-zA-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const nameTokens = (s: string) => normalizeArabicName(s).split(' ').filter(Boolean);

// مفتاح مطابقة تام بعد التوحيد (يتجاهل المسافات أيضًا)
export const canonicalNameKey = (s: string) => nameTokens(s).join('');

// اسم ناقص (ثلاثي) يُعتبر نفس الاسم إن كان بداية الاسم الأطول
export const areSimilarNames = (a: string, b: string) => {
  const ta = nameTokens(a), tb = nameTokens(b);
  if (!ta.length || !tb.length) return false;
  if (ta.join('') === tb.join('')) return true;
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  if (short.length < 3) return false;
  return short.every((t, i) => t === long[i]);
};

// ===== Merge duplicate students by fuzzy Arabic name matching =====
export const mergeDuplicateStudents = async (): Promise<number> => {
  const students = await getCachedStudents();
  const allHistory = await getCachedHifzHistory();
  const allYearData = await getCachedYearData();

  // تجميع بالتشابه: مطابقة تامة بعد التوحيد أو اسم ناقص هو بداية اسم أطول
  const valid = students.filter(s => nameTokens(s.name).length > 0);
  const clusters: (typeof students)[] = [];
  for (const s of valid) {
    const target = clusters.find(c => c.some(m => areSimilarNames(m.name, s.name)));
    if (target) target.push(s); else clusters.push([s]);
  }
  const groups: Record<string, typeof students> = {};
  clusters.forEach((c, i) => { groups[String(i)] = c; });

  const { putCachedHifzRow, putCachedYearData, deleteItem } = await import("./localDB");
  let mergedCount = 0;

  for (const key in groups) {
    const group = groups[key];
    if (group.length < 2) continue;
    // Keep the one with the smallest id as primary
    group.sort((a, b) => a.id - b.id);
    const primary = group[0];
    const dupes = group.slice(1);

    // اعتماد الاسم الأكمل (الأطول) للسجل الأساسي
    const fullest = group.reduce((a, b) => (nameTokens(b.name).length > nameTokens(a.name).length ? b : a));
    if (fullest.name.trim() !== primary.name.trim()) {
      await saveStudent({ id: primary.id, name: fullest.name.trim(), teacher: primary.teacher || fullest.teacher || '' });
      primary.name = fullest.name.trim();
    }

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

// ================= إضافات النسخة الجديدة =================
import { MonthlyRecord, QuranPoint, TRACKING_MONTHS } from "@/types/student";
import { calcPagesBetweenAsync } from "@/utils/quranData";
import { resolveBaseHifz } from "@/utils/calculations";

const canUseCloud = (userId: string | null): userId is string => !!userId && isOnline();

const ensureCache = async () => {
  const hasCache = await isCachePopulated();
  if (!hasCache) await syncFromCloud();
};

export const emptyYearData = (): YearData => ({
  baseHifz: '0', totalHifz: '0', parts: '', annual: '', recitation: '',
  memorization: '', total: '0', grade: '', prize: '0', statusPrize: '', rank: '-',
  teacher: ''
});

// ===== سجلات الإكراميات والشهادات (قراءة مباشرة من قاعدة البيانات) =====
export interface AwardRow {
  id: string;
  year: string;
  recipient_type: string;
  recipient_name: string;
  award_type: string;
  award_kind: string;
  amount: number;
  item?: string | null;
  student_name?: string | null;
  notes?: string | null;
  awarded_at: string;
  funded_by?: string | null;
}

export interface CertificateRow {
  id: string;
  year: string;
  recipient_type: string;
  recipient_name: string;
  cert_type: string;
  title: string;
  notes?: string | null;
  issued_at: string;
}

export const loadAwards = async (year?: string): Promise<AwardRow[]> => {
  const userId = await getUserId();
  if (!canUseCloud(userId)) return [];
  let q = supabase.from('awards').select('*').eq('user_id', userId);
  if (year) q = q.eq('year', year);
  const { data, error } = await q.order('awarded_at', { ascending: false });
  if (error) { console.error('loadAwards failed:', error); return []; }
  return (data || []) as unknown as AwardRow[];
};

export const loadCertificates = async (year?: string): Promise<CertificateRow[]> => {
  const userId = await getUserId();
  if (!canUseCloud(userId)) return [];
  let q = supabase.from('certificates').select('*').eq('user_id', userId);
  if (year) q = q.eq('year', year);
  const { data, error } = await q.order('issued_at', { ascending: false });
  if (error) { console.error('loadCertificates failed:', error); return []; }
  return (data || []) as unknown as CertificateRow[];
};

// ===== استدعاء الطالبات من الأعوام السابقة =====
export interface RecallCandidate {
  id: number;
  name: string;
  teacher: string;
  lastYear: string;
  baseHifz: number;
  years: string[];
}

// الطالبات الموجودات في أعوام أخرى وغير مسجّلات في العام المختار
export const listRecallCandidates = async (year: string): Promise<RecallCandidate[]> => {
  await ensureCache();
  const students = await getCachedStudents();
  const allYearData = await getCachedYearData();
  const allHistory = await getCachedHifzHistory();
  const yearNum = parseInt(year);

  const byStudent = new Map<number, typeof allYearData>();
  allYearData.forEach(row => {
    const list = byStudent.get(row.student_id) || [];
    list.push(row);
    byStudent.set(row.student_id, list);
  });

  const historyMap: Record<number, HifzHistory> = {};
  allHistory.forEach(row => {
    if (!historyMap[row.student_id]) historyMap[row.student_id] = {};
    historyMap[row.student_id][row.year_key] = row.value;
  });

  const candidates: RecallCandidate[] = [];
  for (const s of students) {
    const rows = byStudent.get(s.id) || [];
    if (rows.some(r => r.year === year)) continue;
    const previous = rows.filter(r => parseInt(r.year) < yearNum).sort((a, b) => a.year.localeCompare(b.year));
    if (previous.length === 0) continue;

    const history = { ...(historyMap[s.id] || {}) };
    previous.forEach(r => {
      const parts = parseFloat(r.parts) || 0;
      if (parts > 0) {
        const key = `h${r.year}`;
        if ((parseFloat(history[key]) || 0) < parts) history[key] = parts.toString();
      }
    });

    const last = previous[previous.length - 1];
    const lastTotalHifz = parseFloat(last.total_hifz) || 0;
    const baseHifz = resolveBaseHifz(history, yearNum, lastTotalHifz);

    candidates.push({
      id: s.id,
      name: s.name,
      teacher: last.teacher || s.teacher || '',
      lastYear: last.year,
      baseHifz,
      years: rows.map(r => r.year).sort(),
    });
  }

  return candidates.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
};

// استدعاء طالبات من الأعوام السابقة إلى العام المختار مع ترحيل الحفظ التراكمي
export const recallStudentsToYear = async (year: string, ids: number[]): Promise<number> => {
  const candidates = await listRecallCandidates(year);
  const map = new Map(candidates.map(c => [c.id, c]));
  let added = 0;

  for (const id of ids) {
    const c = map.get(id);
    if (!c) continue;
    await saveYearData(year, id, {
      ...emptyYearData(),
      teacher: c.teacher,
      baseHifz: c.baseHifz.toString(),
      totalHifz: c.baseHifz.toString(),
    });
    added++;
  }

  return added;
};


// تسجيل طالبة في العام المختار (لطالبة جديدة)
export const registerStudentInYear = async (year: string, studentId: number, teacher = '') => {
  await saveYearData(year, studentId, { ...emptyYearData(), teacher });
};

// ================= المتابعة الشهرية =================
// اتصال مباشر بقاعدة البيانات (بدون تخزين مؤقت أوفلاين كامل، على غرار
// getTableFilters/setTableFilters) — يحتاج اتصال إنترنت وقت الحفظ والقراءة.


const emptyPoint = (): QuranPoint => ({ surah: null, ayah: null });

const emptyMonthlyRecord = (): MonthlyRecord => ({
  memoFrom: emptyPoint(), memoTo: emptyPoint(), memoHifzScore: "", memoRecitationScore: "",
  reviewFrom: emptyPoint(), reviewTo: emptyPoint(), reviewHifzScore: "", reviewRecitationScore: "",
  attendanceScore: "", behaviorScore: "",
});

const rowToRecord = (row: any): MonthlyRecord => ({
  memoFrom: { surah: row.memorization_from_surah ?? null, ayah: row.memorization_from_ayah ?? null },
  memoTo: { surah: row.memorization_to_surah ?? null, ayah: row.memorization_to_ayah ?? null },
  memoHifzScore: row.memorization_hifz_score?.toString() || "",
  memoRecitationScore: row.memorization_recitation_score?.toString() || "",
  reviewFrom: { surah: row.review_from_surah ?? null, ayah: row.review_from_ayah ?? null },
  reviewTo: { surah: row.review_to_surah ?? null, ayah: row.review_to_ayah ?? null },
  reviewHifzScore: row.review_hifz_score?.toString() || "",
  reviewRecitationScore: row.review_recitation_score?.toString() || "",
  attendanceScore: row.attendance_score?.toString() || "",
  behaviorScore: row.behavior_score?.toString() || "",
});

// يحمّل سجل شهر واحد لكل الطالبات لعام معيّن (لعرض جدول شهر بعينه)
export const loadMonthlyTrackingForMonth = async (
  year: string,
  month: number
): Promise<Record<number, MonthlyRecord>> => {
  const userId = await getUserId();
  const result: Record<number, MonthlyRecord> = {};
  if (!canUseCloud(userId)) return result;

  const { data, error } = await supabase
    .from('monthly_tracking')
    .select('*')
    .eq('user_id', userId)
    .eq('year', year)
    .eq('month', month);

  if (error) {
    console.error('loadMonthlyTrackingForMonth failed:', error);
    return result;
  }

  (data || []).forEach((row: any) => { result[row.student_id] = rowToRecord(row); });
  return result;
};

// يحمّل كل الأشهر (1-9) لطالبة واحدة خلال عام معيّن (لعرض بطاقتها الكاملة)
export const loadMonthlyTrackingForStudent = async (
  year: string,
  studentId: number
): Promise<Record<number, MonthlyRecord>> => {
  const userId = await getUserId();
  const result: Record<number, MonthlyRecord> = {};
  if (!canUseCloud(userId)) return result;

  const { data, error } = await supabase
    .from('monthly_tracking')
    .select('*')
    .eq('user_id', userId)
    .eq('year', year)
    .eq('student_id', studentId);

  if (error) {
    console.error('loadMonthlyTrackingForStudent failed:', error);
    return result;
  }

  (data || []).forEach((row: any) => { result[row.month] = rowToRecord(row); });
  return result;
};

// يجيب "إلى" آخر شهر مسبوق فيه بيانات لهذي الطالبة (لكلا القسمين)
// حتى تُستخدم تلقائياً كنقطة بداية ("من") للشهر الحالي
export const getPreviousMonthEndPoints = async (
  year: string,
  studentId: number,
  beforeMonth: number
): Promise<{ memoFrom: QuranPoint; reviewFrom: QuranPoint }> => {
  const all = await loadMonthlyTrackingForStudent(year, studentId);
  for (let m = beforeMonth - 1; m >= 1; m--) {
    const rec = all[m];
    if (rec && (rec.memoTo.surah || rec.reviewTo.surah)) {
      return {
        memoFrom: rec.memoTo.surah ? rec.memoTo : emptyPoint(),
        reviewFrom: rec.reviewTo.surah ? rec.reviewTo : emptyPoint(),
      };
    }
  }
  return { memoFrom: emptyPoint(), reviewFrom: emptyPoint() };
};

// يحفظ سجل شهر واحد لطالبة، ثم يعيد احتساب الإجماليات السنوية تلقائياً
// ويحدّث "حفظ جديد" و"السنوية" بالجدول الرئيسي (year_data) — مع بقائها
// قابلة للتعديل اليدوي لاحقاً (مثلاً لإضافة حفظ إضافي بعطلة رمضان قبل المسابقة).
export const saveMonthlyRecord = async (
  year: string,
  studentId: number,
  month: number,
  record: MonthlyRecord
): Promise<boolean> => {
  const userId = await getUserId();
  if (!canUseCloud(userId)) return false;

  const { error } = await supabase.from('monthly_tracking').upsert({
    user_id: userId,
    student_id: studentId,
    year,
    month,
    memorization_from_surah: record.memoFrom.surah,
    memorization_from_ayah: record.memoFrom.ayah,
    memorization_to_surah: record.memoTo.surah,
    memorization_to_ayah: record.memoTo.ayah,
    memorization_hifz_score: parseFloat(record.memoHifzScore) || 0,
    memorization_recitation_score: parseFloat(record.memoRecitationScore) || 0,
    review_from_surah: record.reviewFrom.surah,
    review_from_ayah: record.reviewFrom.ayah,
    review_to_surah: record.reviewTo.surah,
    review_to_ayah: record.reviewTo.ayah,
    review_hifz_score: parseFloat(record.reviewHifzScore) || 0,
    review_recitation_score: parseFloat(record.reviewRecitationScore) || 0,
    attendance_score: parseFloat(record.attendanceScore) || 0,
    behavior_score: parseFloat(record.behaviorScore) || 0,
  }, { onConflict: 'student_id,year,month' });

  if (error) {
    console.error('saveMonthlyRecord failed:', error);
    return false;
  }

  await recomputeAnnualFromMonthly(year, studentId);
  return true;
};

// يعيد احتساب "حفظ جديد" (من مجموع أوجه قسم الحفظ المحسوبة تلقائياً ÷ 20)
// و"السنوية" (متوسط السلوك+المواظبة الشهري من 20) من كل سجلات المتابعة
// الشهرية للطالبة، ويكتبها بجدول بيانات العام الرئيسي (year_data) — القيم
// تبقى قابلة للتعديل اليدوي بعدها (مثلاً لإضافة حفظ إضافي بعطلة رمضان).
export const recomputeAnnualFromMonthly = async (year: string, studentId: number) => {
  const userId = await getUserId();
  if (!canUseCloud(userId)) return;

  const { data, error } = await supabase
    .from('monthly_tracking')
    .select('*')
    .eq('user_id', userId)
    .eq('year', year)
    .eq('student_id', studentId);

  if (error || !data) return;

  const pagesPerRow = await Promise.all(data.map(async (r: any) => {
    if (!r.memorization_from_surah || !r.memorization_to_surah) return 0;
    return calcPagesBetweenAsync(
      r.memorization_from_surah, r.memorization_from_ayah,
      r.memorization_to_surah, r.memorization_to_ayah
    );
  }));
  const totalPages = pagesPerRow.reduce((sum, p) => sum + p, 0);

  const monthsWithScores = data.filter((r: any) => (parseFloat(r.attendance_score) || 0) > 0 || (parseFloat(r.behavior_score) || 0) > 0);
  const totalMonthlyOutOf20 = data.reduce((sum: number, r: any) => sum + ((parseFloat(r.attendance_score) || 0) + (parseFloat(r.behavior_score) || 0)), 0);
  const monthCount = monthsWithScores.length || 1;

  const partsFromPages = totalPages / 20; // 20 وجه = جزء
  const annualScore = totalMonthlyOutOf20 / monthCount; // متوسط من 20

  const existing = await loadYearData(year, studentId);
  await saveYearData(year, studentId, {
    ...existing,
    parts: partsFromPages > 0 ? partsFromPages.toFixed(2).replace(/\.00$/, '') : existing.parts,
    annual: totalMonthlyOutOf20 > 0 ? annualScore.toFixed(2).replace(/\.00$/, '') : existing.annual,
  });
  // ادفع التحديث للسحابة فوراً حتى ينعكس بالجدول الرئيسي من أي جهاز آخر مباشرة
  await syncToCloud();
};

// ===== إحصائيات الحفظ والمراجعة (منفصلة عن درجات المسابقة الرمضانية) =====
// تُستخدم لترشيح: أفضل طالب/ة بالحفظ خلال شهر معيّن، وأفضل طالب/ة بالمراجعة
export interface MonthlyRanking {
  studentId: number;
  memoScore: number;   // تسميع الحفظ + تلاوة الحفظ (من 40)
  reviewScore: number; // تسميع المراجعة + تلاوة المراجعة (من 40)
  pagesThisMonth: number;
}

export const getMonthlyRankings = async (
  year: string,
  month: number
): Promise<MonthlyRanking[]> => {
  const userId = await getUserId();
  if (!canUseCloud(userId)) return [];

  const { data, error } = await supabase
    .from('monthly_tracking')
    .select('*')
    .eq('user_id', userId)
    .eq('year', year)
    .eq('month', month);

  if (error || !data) return [];

  return Promise.all(data.map(async (r: any) => ({
    studentId: r.student_id,
    memoScore: (parseFloat(r.memorization_hifz_score) || 0) + (parseFloat(r.memorization_recitation_score) || 0),
    reviewScore: (parseFloat(r.review_hifz_score) || 0) + (parseFloat(r.review_recitation_score) || 0),
    pagesThisMonth: r.memorization_from_surah && r.memorization_to_surah
      ? await calcPagesBetweenAsync(r.memorization_from_surah, r.memorization_from_ayah, r.memorization_to_surah, r.memorization_to_ayah)
      : 0,
  })));
};

// يجيب آخر عام وشهر تم تسجيل متابعة فيهما فعلياً (لأي طالبة)، لفتح صفحة
// المتابعة الشهرية تلقائياً على آخر نقطة توقف عندها العمل، بدل قيمة ثابتة
export const getLatestTrackedPeriod = async (): Promise<{ year: string; month: number } | null> => {
  const userId = await getUserId();
  if (!canUseCloud(userId)) return null;

  const { data, error } = await supabase
    .from('monthly_tracking')
    .select('year, month')
    .eq('user_id', userId)
    .order('year', { ascending: false })
    .order('month', { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) return null;
  return { year: data[0].year, month: data[0].month };
};

export { TRACKING_MONTHS };

// ===== كشف الخاتمات =====
// يجمع كل الطالبات اللي ختمن القرآن الكريم (30 جزء) بكل الأعوام، من كل
// سجلات year_data — يتحدّث تلقائياً كل ما طالبة جديدة تختم بأي عام
export interface KhatimEntry {
  studentId: number;
  name: string;
  teacher: string;
  year: string;
  totalScore: string;
  grade: string;
}

// يتحقق هل اسم معيّن مسجّل مسبقاً لطالبة أخرى (باستثناء رقم الطالبة الحالية
// نفسها)، ويرجع الأعوام اللي هي مسجّلة فيها فعلياً — يُستخدم لمنع إضافة
// طالبة "جديدة" بنفس اسم طالبة موجودة مسبقاً بعام سابق بالغلط
export const checkGlobalDuplicateName = async (
  name: string,
  excludeId?: number
): Promise<{ studentId: number; years: string[] } | null> => {
  const userId = await getUserId();
  if (!canUseCloud(userId)) return null;

  const normalized = (name || '').trim().replace(/\s+/g, ' ');
  if (!normalized) return null;

  const { data: matches, error } = await supabase
    .from('students')
    .select('id, name')
    .eq('user_id', userId)
    .ilike('name', normalized);

  if (error || !matches) return null;

  const match = matches.find((m: any) => {
    const mNorm = (m.name || '').trim().replace(/\s+/g, ' ');
    return mNorm.toLowerCase() === normalized.toLowerCase() && m.id !== excludeId;
  });
  if (!match) return null;

  const { data: yearsData } = await supabase
    .from('year_data')
    .select('year')
    .eq('user_id', userId)
    .eq('student_id', match.id);

  const years = Array.from(new Set((yearsData || []).map((r: any) => r.year))).sort();
  return { studentId: match.id, years };
};


export const loadKhatimat = async (): Promise<KhatimEntry[]> => {
  const userId = await getUserId();
  if (!canUseCloud(userId)) return [];

  const { data, error } = await supabase
    .from('year_data')
    .select('student_id, year, total_hifz, total, grade, teacher, students(name)')
    .eq('user_id', userId);

  if (error || !data) {
    console.error('loadKhatimat failed:', error);
    return [];
  }

  return data
    .filter((r: any) => (parseFloat(r.total_hifz) || 0) >= 30)
    .map((r: any) => ({
      studentId: r.student_id,
      name: r.students?.name || '',
      teacher: r.teacher || '',
      year: r.year,
      totalScore: r.total || '0',
      grade: r.grade || '',
    }))
    .sort((a, b) => a.year.localeCompare(b.year) || a.name.localeCompare(b.name, 'ar'));
};

