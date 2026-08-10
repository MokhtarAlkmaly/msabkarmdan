import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CompetitionTable } from "@/components/CompetitionTable";
import { ImportExport } from "@/components/ImportExport";
import { NotificationSystem } from "@/components/notifications/NotificationSystem";
import { InstallPrompt } from "@/components/InstallPrompt";
import { Plus, Printer, Trash2, Calendar, LogOut, Save, Camera, Wifi, WifiOff, RefreshCw, Users, Award, HeartHandshake, Receipt, ScrollText } from "lucide-react";
import logo from "@/assets/logo.png";
import { Student, HifzHistory, YearData, START_YEAR, END_YEAR } from "@/types/student";
import {
  loadAllStudentsWithData,
  loadGlobalStudents,
  saveStudent,
  deleteAllStudents,
  getActiveYear,
  setActiveYear,
  saveHifzHistory,
  saveYearData,
  migrateYearData,
  syncToCloud,
  syncFromCloud,
  mergeDuplicateStudents,
} from "@/utils/storage";
import { getPendingChanges } from "@/utils/localDB";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { Settings as SettingsIcon, Building2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";

interface DirtyData {
  name: string;
  teacher: string;
  history: HifzHistory;
  yearData: YearData;
}

const Index = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [currentYear, setCurrentYear] = useState<string>("1447");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ current: number; total: number; label?: string } | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [dirtyMap, setDirtyMap] = useState<Record<number, DirtyData>>({});
  const [teacherNames, setTeacherNames] = useState<string[]>([]);
  const { toast } = useToast();
  const { user, signOut } = useAuth();
  const { profile, logoUrl: centerLogo, isAdmin } = useProfile();
  const centerName = profile?.center_name || "مركز إنماء الأهلي الخيري";

  const isDirty = Object.keys(dirtyMap).length > 0;

  const loadData = useCallback(async () => {
    setLoading(true);
    const studentsWithData = await loadAllStudentsWithData(currentYear);
    setStudents(studentsWithData);
    setDirtyMap({});
    setLoading(false);
  }, [currentYear]);

  const loadTeachers = useCallback(async () => {
    if (!user) { setTeacherNames([]); return; }
    const { data } = await supabase
      .from("teachers")
      .select("name")
      .eq("user_id", user.id)
      .eq("year", currentYear)
      .order("name");
    setTeacherNames((data || []).map((r: any) => r.name));
  }, [user, currentYear]);

  useEffect(() => { void loadTeachers(); }, [loadTeachers]);

  // Merge dropdown: registered teachers + teachers already used by students this year
  const mergedTeacherNames = (() => {
    const set = new Set<string>(teacherNames);
    for (const s of students) {
      const t = (s.teacher || "").trim();
      if (t) set.add(t);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ar"));
  })();
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') void loadTeachers(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', loadTeachers);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', loadTeachers);
    };
  }, [loadTeachers]);

  // No automatic cloud sync during data entry — saving/syncing happens once
  // when the user presses "حفظ التغييرات". We only track connectivity here.
  const [pendingCount, setPendingCount] = useState(0);

  const refreshPendingCount = useCallback(async () => {
    if (!user) { setPendingCount(0); return; }
    try {
      const pending = await getPendingChanges();
      setPendingCount(pending.length);
    } catch { setPendingCount(0); }
  }, [user]);

  useEffect(() => { void refreshPendingCount(); }, [refreshPendingCount, loading]);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // Block closing/refreshing the app while there are unsaved or unsynced changes
  useEffect(() => {
    const hasUnsaved = isDirty || pendingCount > 0;
    if (!hasUnsaved) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'هناك بيانات غير محفوظة أو غير مزامنة. اضغط «حفظ التغييرات» قبل الخروج.';
      return e.returnValue;
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty, pendingCount]);

  useEffect(() => {
    const init = async () => {
      const year = await getActiveYear();
      setCurrentYear(year);
      // Auto-remove duplicate students silently on startup (local only — no cloud sync)
      try {
        await mergeDuplicateStudents();
      } catch (e) {
        console.error('Auto-merge failed:', e);
      }
    };
    init();
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDirtyChange = useCallback((studentId: number, data: DirtyData) => {
    setDirtyMap(prev => ({ ...prev, [studentId]: data }));
  }, []);

  const handleSaveAll = async (withSync: boolean = true) => {
    if (!isDirty) return;

    // Prevent duplicate student names (case-insensitive, trimmed)
    const norm = (s: string) => (s || '').trim().replace(/\s+/g, ' ');
    const nameById = new Map<number, string>();
    for (const s of students) nameById.set(s.id, s.name);
    for (const [idStr, data] of Object.entries(dirtyMap)) {
      nameById.set(parseInt(idStr), data.name);
    }
    const counts: Record<string, number[]> = {};
    for (const [id, n] of nameById) {
      const key = norm(n);
      if (!key) continue;
      (counts[key] = counts[key] || []).push(id);
    }
    const dupNames = Object.entries(counts).filter(([, ids]) => ids.length > 1).map(([k]) => k);
    if (dupNames.length > 0) {
      toast({
        title: "أسماء مكررة",
        description: `يوجد تكرار في: ${dupNames.join('، ')}. الرجاء تعديل الأسماء قبل الحفظ.`,
        variant: "destructive",
      });
      return;
    }

    setSaving(true);

    try {
      const entries = Object.entries(dirtyMap);
      await Promise.all(entries.map(async ([idStr, data]) => {
        const id = parseInt(idStr);
        await saveStudent({ id, name: data.name, teacher: data.teacher });
        await saveHifzHistory(id, data.history);
        await saveYearData(currentYear, id, data.yearData);
      }));

      setDirtyMap({});

      let synced = false;
      if (withSync) {
        // Single sync at the end of data entry
        setSyncProgress({ current: 0, total: 1, label: 'بدء الرفع' });
        synced = await syncToCloud((current, total, label) =>
          setSyncProgress({ current, total, label })
        );
        setSyncProgress(null);
      }

      await loadData();
      await refreshPendingCount();

      if (withSync) {
        toast({
          title: "تم الحفظ",
          description: synced
            ? `تم حفظ ومزامنة بيانات ${entries.length} طالبة بنجاح`
            : `تم الحفظ محلياً (${entries.length} طالبة) - اضغط «حفظ التغييرات» عند توفر الإنترنت`,
        });
      }
    } catch (error) {
      console.error('Save error:', error);
      toast({
        title: "خطأ في الحفظ",
        description: "حدث خطأ أثناء حفظ البيانات، حاول مرة أخرى",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleYearChange = async (year: string) => {
    if (isDirty && !confirm('هناك تغييرات غير محفوظة، هل تريد المتابعة بدون حفظ؟')) return;

    const globalStudents = await loadGlobalStudents();
    await migrateYearData(year, globalStudents);

    setCurrentYear(year);
    await setActiveYear(year);
    toast({
      title: "تم تغيير السنة",
      description: `تم التبديل إلى عام ${year}هـ`,
    });
  };

  // Single manual save + sync, used by the main button
  const handleSaveAndSync = async () => {
    if (isDirty) {
      await handleSaveAll(true);
      return;
    }
    if (pendingCount === 0) return;
    if (!online) {
      toast({ title: 'لا يوجد اتصال', description: 'سيتم الرفع عند توفر الإنترنت', variant: 'destructive' });
      return;
    }
    setSaving(true);
    setSyncProgress({ current: 0, total: 1, label: 'بدء الرفع' });
    const ok = await syncToCloud((current, total, label) => setSyncProgress({ current, total, label }));
    setSyncProgress(null);
    await refreshPendingCount();
    setSaving(false);
    toast({
      title: ok ? 'تمت المزامنة' : 'فشل الرفع',
      description: ok ? 'تم رفع كل البيانات إلى السحابة' : 'حاول مرة أخرى',
      variant: ok ? undefined : 'destructive',
    });
  };

  const addNewStudent = async () => {
    if (isDirty) {
      await handleSaveAll(false);
      if (Object.keys(dirtyMap).length > 0) return; // save blocked (duplicates)
    }
    const newId = await saveStudent({ name: '', teacher: '' });
    if (newId) {
      await loadData();
      toast({
        title: "تمت الإضافة",
        description: "تم إضافة طالبة جديدة",
      });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('هل أنت متأكد من حذف هذه الطالبة؟')) return;

    const { deleteStudent } = await import("@/utils/storage");
    await deleteStudent(id);
    
    setDirtyMap(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

    await loadData();
    toast({
      title: "تم الحذف",
      description: "تم حذف الطالبة بنجاح",
      variant: "destructive",
    });
  };

  const handleReset = async () => {
    if (!confirm('هل أنت متأكد من حذف جميع البيانات؟ هذا الإجراء لا يمكن التراجع عنه!')) return;

    await deleteAllStudents();
    setStudents([]);
    setDirtyMap({});
    
    toast({
      title: "تم الحذف",
      description: "تم حذف جميع البيانات",
      variant: "destructive",
    });
  };

  const handlePrint = () => {
    window.print();
  };

  const handleSyncFromCloud = async () => {
    if (!online) {
      toast({ title: "لا يوجد اتصال", description: "يرجى الاتصال بالإنترنت أولاً", variant: "destructive" });
      return;
    }
    setSyncing(true);
    setSyncProgress({ current: 0, total: 4, label: 'بدء التنزيل' });
    const success = await syncFromCloud((current, total, label) =>
      setSyncProgress({ current, total, label })
    );
    setSyncProgress(null);
    if (success) {
      await loadData();
      toast({ title: "تمت المزامنة", description: "تم تحديث البيانات من السحابة" });
    } else {
      toast({ title: "خطأ", description: "فشل في المزامنة", variant: "destructive" });
    }
    setSyncing(false);
  };

  // حساب الترتيب - محلياً فقط بدون حفظ تلقائي
  useEffect(() => {
    const sortedStudents = [...students]
      .filter(s => parseFloat(s.yearData?.total || '0') > 0)
      .sort((a, b) => parseFloat(b.yearData?.total || '0') - parseFloat(a.yearData?.total || '0'));

    let changed = false;
    for (let i = 0; i < sortedStudents.length; i++) {
      const student = sortedStudents[i];
      const newRank = (i + 1).toString();
      if (student.yearData && student.yearData.rank !== newRank) {
        student.yearData.rank = newRank;
        changed = true;
      }
    }
    if (changed) {
      setStudents(prev => [...prev]);
    }
  }, [students.length, currentYear]);

  const now = new Date();
  const currentDate = now.toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const dayName = now.toLocaleDateString('ar-EG', { weekday: 'long' });
  const hijriDate = now.toLocaleDateString('ar-SA-u-ca-islamic-umalqura', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <InstallPrompt />
      
      <header className="bg-primary text-primary-foreground py-6 px-4 print:py-4">
        <div className="container mx-auto">
          <div className="flex flex-col items-center mb-4">
            <img src={centerLogo || logo} alt={centerName} className="h-24 w-auto mb-4 print:h-20" />
          </div>
          
          <div className="flex justify-between items-start mb-4 print:mb-2">
            <div className="text-sm text-primary-foreground/90">
              <div className="font-bold">{centerName}</div>
              <div>الإشراف - شرعب الرونة</div>
            </div>

            <div className="text-center flex-1">
              <h1 className="text-3xl font-bold mb-2 print:text-2xl">بسم الله الرحمن الرحيم</h1>
              <h2 className="text-xl print:text-lg">
                كشف المسابقة الرمضانية للعام {currentYear}هـ
              </h2>
            </div>

            <div className="text-sm text-left text-primary-foreground/90">
              <div className="font-semibold">{dayName}</div>
              <div>{hijriDate}</div>
              <div>{currentDate}</div>
              <Button
                onClick={signOut}
                variant="ghost"
                size="sm"
                className="mt-2 text-primary-foreground/80 hover:text-primary-foreground gap-1 print:hidden"
              >
                <LogOut className="h-3 w-3" />
                خروج
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 print:hidden space-y-4">
        <NotificationSystem students={students} currentYear={currentYear} />
        <ImportExport onDataImported={loadData} />

        <div className="bg-card rounded-lg border border-border p-4 space-y-4">
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-3">
            <Link to="/teachers" className="w-full sm:w-auto">
              <Button className="w-full gap-2">
                <Users className="h-4 w-4" />
                المعلمات
              </Button>
            </Link>
            <Link to="/awards" className="w-full sm:w-auto">
              <Button className="w-full gap-2">
                <Award className="h-4 w-4" />
                الإكراميات والجوائز
              </Button>
            </Link>
            <Link to="/donors" className="w-full sm:w-auto">
              <Button className="w-full gap-2" variant="secondary">
                <HeartHandshake className="h-4 w-4" />
                الداعمون
              </Button>
            </Link>
            <Link to="/expenses" className="w-full sm:w-auto">
              <Button className="w-full gap-2" variant="secondary">
                <Receipt className="h-4 w-4" />
                مصروفات الحفل
              </Button>
            </Link>
            <Link to="/certificates" className="w-full sm:w-auto">
              <Button className="w-full gap-2" variant="secondary">
                <ScrollText className="h-4 w-4" />
                الشهادات
              </Button>
            </Link>
          </div>

          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2 bg-primary/10 px-4 py-2 rounded-md border-2 border-primary">
              <Calendar className="h-5 w-5 text-primary" />
              <span className="font-semibold text-primary">سنة المسابقة:</span>
              <Select value={currentYear} onValueChange={handleYearChange}>
                <SelectTrigger className="w-32 bg-background font-bold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: END_YEAR - START_YEAR + 1 }, (_, i) => START_YEAR + i).map(year => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}هـ
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button onClick={addNewStudent} className="gap-2">
              <Plus className="h-4 w-4" />
              إضافة طالبة جديدة
            </Button>

            <Button
              onClick={() => void handleSaveAndSync()}
              disabled={(!isDirty && pendingCount === 0) || saving}
              className={`gap-2 ${isDirty || pendingCount > 0 ? 'animate-pulse bg-green-600 hover:bg-green-700' : ''}`}
            >
              <Save className="h-4 w-4" />
              {saving ? 'جارٍ الحفظ والمزامنة...' : 'حفظ ومزامنة'}
              {(isDirty || pendingCount > 0) && (
                <span className="bg-white/20 rounded-full px-2 py-0.5 text-xs">
                  {Object.keys(dirtyMap).length || pendingCount}
                </span>
              )}
            </Button>

            <Button onClick={handlePrint} variant="secondary" className="gap-2">
              <Printer className="h-4 w-4" />
              طباعة
            </Button>

            <Button onClick={handleReset} variant="destructive" className="gap-2">
              <Trash2 className="h-4 w-4" />
              حذف جميع البيانات
            </Button>

            <Link to="/media">
              <Button variant="outline" className="gap-2">
                <Camera className="h-4 w-4" />
                الصور والفيديوهات
              </Button>
            </Link>

            <Button
              onClick={handleSyncFromCloud}
              disabled={syncing || !online}
              variant="outline"
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
              {syncProgress ? `${syncProgress.current}/${syncProgress.total}` : 'مزامنة'}
            </Button>

            <div className="mr-auto flex items-center gap-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                {online ? <Wifi className="h-4 w-4 text-success" /> : <WifiOff className="h-4 w-4 text-destructive" />}
                {online ? 'متصل' : 'غير متصل'}
              </span>
              <span>عدد الطالبات: <span className="font-bold text-foreground">{students.length}</span></span>
            </div>
          </div>
          {syncProgress && (
            <div className="mt-2 space-y-1">
              <Progress value={(syncProgress.current / Math.max(syncProgress.total, 1)) * 100} className="h-2" />
              <p className="text-xs text-center text-muted-foreground">
                {syncProgress.label || 'جارٍ المزامنة'}: {syncProgress.current} / {syncProgress.total}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="container mx-auto px-4 pb-8">
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">جارٍ تحميل البيانات...</div>
        ) : (
          <CompetitionTable
            students={students}
            currentYear={currentYear}
            onUpdate={loadData}
            onDelete={handleDelete}
            dirtyMap={dirtyMap}
            onDirtyChange={handleDirtyChange}
            teacherNames={mergedTeacherNames}
          />
        )}
      </div>

      <footer className="text-center text-sm text-muted-foreground py-4 print:py-2">
        تصميم أ/ مختار الكمالي
      </footer>

      <style>{`
        @media print {
          .print\\:hidden { display: none !important; }
          body { font-size: 11px; }
          @page { size: landscape; margin: 10mm; }
        }
      `}</style>
    </div>
  );
};

export default Index;
