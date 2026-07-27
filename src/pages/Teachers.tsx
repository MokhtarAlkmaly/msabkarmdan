import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { ArrowRight, Eye, Gift, Save, Calendar, Users, Pencil, Plus, Trash2, Award } from "lucide-react";
import logo from "@/assets/logo.png";
import { Student, START_YEAR, END_YEAR } from "@/types/student";
import {
  loadAllStudentsWithData,
  getActiveYear,
  setActiveYear,
  saveStudent,
  saveYearData,
  syncToCloud,
} from "@/utils/storage";

const HIJRI_MONTHS = [
  "محرم", "صفر", "ربيع الأول", "ربيع الآخر",
  "جمادى الأولى", "جمادى الآخرة", "رجب", "شعبان",
  "رمضان", "شوال", "ذو القعدة", "ذو الحجة",
];

interface BonusRow {
  id: string;
  teacher_name: string;
  year: string;
  month: number;
  amount: number;
}

interface TeacherAggregate {
  name: string;
  registered: boolean;
  registeredId?: string;
  students: Student[];
}

const YEARS = Array.from({ length: END_YEAR - START_YEAR + 1 }, (_, i) => String(START_YEAR + i));

const Teachers = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [currentYear, setCurrentYear] = useState<string>("");
  const [students, setStudents] = useState<Student[]>([]);
  const [bonuses, setBonuses] = useState<BonusRow[]>([]);
  const [registered, setRegistered] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  // edit dialog
  const [editTeacher, setEditTeacher] = useState<string>("");
  const [editName, setEditName] = useState("");

  // view students dialog
  const [viewTeacher, setViewTeacher] = useState<string>("");

  // bonus dialog
  const [bonusTeacher, setBonusTeacher] = useState<string>("");
  const [bonusYear, setBonusYear] = useState("1447");
  const [bonusMonth, setBonusMonth] = useState<number>(1);
  const [bonusAmount, setBonusAmount] = useState<string>("0");

  // add dialog
  const [addOpen, setAddOpen] = useState(false);
  const [newTeacherName, setNewTeacherName] = useState("");

  const loadAll = useCallback(async () => {
    if (!currentYear) return;
    setLoading(true);
    const year = currentYear;
    setBonusYear(year);
    const list = await loadAllStudentsWithData(year);
    setStudents(list);
    if (user) {
      const { data: bonusData } = await supabase
        .from("teacher_bonuses")
        .select("*")
        .eq("user_id", user.id);
      setBonuses((bonusData as BonusRow[]) || []);
      const { data: regData } = await supabase
        .from("teachers")
        .select("id, name")
        .eq("user_id", user.id)
        .eq("year", year)
        .order("name");
      setRegistered((regData as any) || []);
    }
    setLoading(false);
  }, [user, currentYear]);

  useEffect(() => {
    void (async () => setCurrentYear(await getActiveYear()))();
  }, []);

  useEffect(() => { void loadAll(); }, [loadAll]);

  const handleYearChange = async (y: string) => {
    setCurrentYear(y);
    await setActiveYear(y);
  };

  const teachers = useMemo<TeacherAggregate[]>(() => {
    const map = new Map<string, { students: Student[]; registered: boolean; registeredId?: string }>();
    for (const r of registered) {
      map.set(r.name, { students: [], registered: true, registeredId: r.id });
    }
    for (const s of students) {
      const t = (s.teacher || "").trim();
      if (!t) continue;
      if (!map.has(t)) map.set(t, { students: [], registered: false });
      map.get(t)!.students.push(s);
    }
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, students: v.students, registered: v.registered, registeredId: v.registeredId }))
      .sort((a, b) => a.name.localeCompare(b.name, "ar"));
  }, [students, registered]);

  const totalBonusFor = (teacher: string) =>
    bonuses
      .filter(b => b.teacher_name === teacher && b.year === currentYear)
      .reduce((sum, b) => sum + Number(b.amount || 0), 0);

  const openBonus = (teacher: string) => {
    setBonusTeacher(teacher);
    setBonusYear(currentYear);
    setBonusMonth(1);
    const existing = bonuses.find(
      b => b.teacher_name === teacher && b.year === currentYear && b.month === 1
    );
    setBonusAmount(existing ? String(existing.amount) : "0");
  };

  // Update amount field when year/month changes inside dialog
  useEffect(() => {
    if (!bonusTeacher) return;
    const existing = bonuses.find(
      b => b.teacher_name === bonusTeacher && b.year === bonusYear && b.month === bonusMonth
    );
    setBonusAmount(existing ? String(existing.amount) : "0");
  }, [bonusYear, bonusMonth, bonusTeacher, bonuses]);

  const saveBonus = async () => {
    if (!user || !bonusTeacher) return;
    const amount = parseFloat(bonusAmount) || 0;
    const { error } = await supabase
      .from("teacher_bonuses")
      .upsert(
        {
          user_id: user.id,
          teacher_name: bonusTeacher,
          year: bonusYear,
          month: bonusMonth,
          amount,
        },
        { onConflict: "user_id,teacher_name,year,month" }
      );
    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "تم الحفظ", description: `إكرامية ${HIJRI_MONTHS[bonusMonth - 1]} ${bonusYear}هـ` });
    const { data } = await supabase
      .from("teacher_bonuses")
      .select("*")
      .eq("user_id", user.id);
    setBonuses((data as BonusRow[]) || []);
  };

  const openEdit = (teacher: string) => {
    setEditTeacher(teacher);
    setEditName(teacher);
  };

  const saveEdit = async () => {
    if (!editTeacher) return;
    const newName = editName.trim();
    if (!newName || newName === editTeacher) {
      setEditTeacher(null);
      return;
    }
    const affected = students.filter(s => (s.teacher || "").trim() === editTeacher);
    for (const s of affected) {
      await saveStudent({ id: s.id, name: s.name, teacher: newName });
      if (s.yearData) {
        await saveYearData(currentYear, s.id, { ...s.yearData, teacher: newName });
      }
    }
    // rename bonuses too
    if (user) {
      await supabase
        .from("teacher_bonuses")
        .update({ teacher_name: newName })
        .eq("user_id", user.id)
        .eq("teacher_name", editTeacher);
      // rename in teachers table (if exists for this year)
      await supabase
        .from("teachers")
        .update({ name: newName })
        .eq("user_id", user.id)
        .eq("year", currentYear)
        .eq("name", editTeacher);
    }
    await syncToCloud();
    setEditTeacher(null);
    toast({ title: "تم التعديل", description: `تم تحديث اسم المعلمة (${affected.length} طالبة)` });
    await loadAll();
  };

  const addTeacher = async () => {
    if (!user) return;
    const name = newTeacherName.trim();
    if (!name) return;
    const { error } = await supabase.from("teachers").insert({
      user_id: user.id, year: currentYear, name,
    });
    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "تمت الإضافة", description: `${name} — ${currentYear}هـ` });
    setNewTeacherName("");
    setAddOpen(false);
    await loadAll();
  };

  const deleteTeacher = async (t: TeacherAggregate) => {
    if (!user) return;
    const studentCount = t.students.length;
    const msg = studentCount > 0
      ? `حذف "${t.name}" من قائمة معلمات ${currentYear}هـ؟ (يوجد ${studentCount} طالبة مرتبطة، سيتم تفريغ خانة المعلمة لديهن)`
      : `حذف "${t.name}" من قائمة معلمات ${currentYear}هـ؟`;
    if (!confirm(msg)) return;
    if (t.registeredId) {
      await supabase.from("teachers").delete().eq("id", t.registeredId);
    }
    // clear teacher from students for this year
    for (const s of t.students) {
      await saveStudent({ id: s.id, name: s.name, teacher: "" });
      if (s.yearData) {
        await saveYearData(currentYear, s.id, { ...s.yearData, teacher: "" });
      }
    }
    await syncToCloud();
    toast({ title: "تم الحذف", description: t.name, variant: "destructive" });
    await loadAll();
  };

  const viewStudents = teachers.find(t => t.name === viewTeacher)?.students || [];

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <header className="bg-primary text-primary-foreground py-6 px-4">
        <div className="container mx-auto">
          <div className="flex items-center justify-between mb-4">
            <Link to="/">
              <Button variant="ghost" size="sm" className="text-primary-foreground gap-1">
                <ArrowRight className="h-4 w-4" />
                رجوع
              </Button>
            </Link>
            <img src={logo} alt="logo" className="h-16 w-auto" />
            <div className="w-20" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold flex items-center justify-center gap-2">
              <Users className="h-6 w-6" />
              المعلمات
            </h1>
            <p className="text-sm opacity-90 mt-1">عام {currentYear}هـ — عدد المعلمات: {teachers.length}</p>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">سنة المسابقة</span>
            <Select value={currentYear} onValueChange={(v) => void handleYearChange(v)}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                {YEARS.map((y) => (
                  <SelectItem key={y} value={y}>{y}هـ</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Link to="/awards">
              <Button variant="outline" className="gap-2">
                <Award className="h-4 w-4" /> الإكراميات والجوائز
              </Button>
            </Link>
            <Button onClick={() => setAddOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" /> إضافة معلمة
            </Button>
          </div>
        </div>
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">جارٍ التحميل...</div>
        ) : teachers.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            لا توجد معلمات مسجلات لعام {currentYear}هـ
          </div>
        ) : (
          <div className="bg-card rounded-lg border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-primary text-primary-foreground">
                  <tr>
                    <th className="px-3 py-3 text-right">#</th>
                    <th className="px-3 py-3 text-right">اسم المعلمة</th>
                    <th className="px-3 py-3 text-center">الحالة</th>
                    <th className="px-3 py-3 text-center">عدد الطالبات</th>
                    <th className="px-3 py-3 text-center">إجمالي إكراميات {currentYear}هـ</th>
                    <th className="px-3 py-3 text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {teachers.map((t, i) => (
                    <tr key={t.name} className="border-t border-border hover:bg-muted/40">
                      <td className="px-3 py-3 text-right font-bold">{i + 1}</td>
                      <td className="px-3 py-3 text-right font-semibold">{t.name}</td>
                      <td className="px-3 py-3 text-center">
                        {t.registered
                          ? <span className="text-success font-semibold">مسجلة</span>
                          : <span className="text-amber-600 font-semibold">من بيانات الطالبات</span>}
                      </td>
                      <td className="px-3 py-3 text-center">{t.students.length}</td>
                      <td className="px-3 py-3 text-center font-bold text-primary">
                        {totalBonusFor(t.name).toLocaleString()} ريال
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-2 justify-center">
                          <Button size="sm" variant="outline" className="gap-1" onClick={() => setViewTeacher(t.name)}>
                            <Eye className="h-4 w-4" />
                            عرض الطالبات
                          </Button>
                          <Button size="sm" className="gap-1 bg-amber-600 hover:bg-amber-700 text-white" onClick={() => openBonus(t.name)}>
                            <Gift className="h-4 w-4" />
                            الإكرامية الشهرية
                          </Button>
                          <Button size="sm" variant="secondary" className="gap-1" onClick={() => openEdit(t.name)}>
                            <Pencil className="h-4 w-4" />
                            تعديل
                          </Button>
                          <Button size="sm" variant="destructive" className="gap-1" onClick={() => deleteTeacher(t)}>
                            <Trash2 className="h-4 w-4" />
                            حذف
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Add teacher dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>إضافة معلمة لعام {currentYear}هـ</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <label className="text-sm font-medium">اسم المعلمة</label>
            <Input
              autoFocus
              value={newTeacherName}
              onChange={(e) => setNewTeacherName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addTeacher(); }}
              placeholder="مثال: أم عبدالله"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAddOpen(false)}>إلغاء</Button>
            <Button onClick={addTeacher} className="gap-1"><Save className="h-4 w-4" />إضافة</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View students dialog */}
      <Dialog open={!!viewTeacher} onOpenChange={(o) => !o && setViewTeacher(null)}>
        <DialogContent className="max-w-xl" dir="rtl">
          <DialogHeader>
            <DialogTitle>طالبات المعلمة: {viewTeacher}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-2 py-2 text-right">#</th>
                  <th className="px-2 py-2 text-right">الاسم</th>
                  <th className="px-2 py-2 text-center">الأجزاء</th>
                  <th className="px-2 py-2 text-center">المجموع</th>
                  <th className="px-2 py-2 text-center">الترتيب</th>
                </tr>
              </thead>
              <tbody>
                {viewStudents.map((s, i) => (
                  <tr key={s.id} className="border-t border-border">
                    <td className="px-2 py-2 text-right">{i + 1}</td>
                    <td className="px-2 py-2 text-right font-medium">{s.name || "—"}</td>
                    <td className="px-2 py-2 text-center">{s.yearData?.parts || "—"}</td>
                    <td className="px-2 py-2 text-center">{s.yearData?.total || "0"}</td>
                    <td className="px-2 py-2 text-center">{s.yearData?.rank || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit teacher dialog */}
      <Dialog open={!!editTeacher} onOpenChange={(o) => !o && setEditTeacher(null)}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>تعديل اسم المعلمة</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <label className="text-sm font-medium">الاسم الجديد</label>
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              سيتم تحديث الاسم لجميع الطالبات والإكراميات المرتبطة.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditTeacher(null)}>إلغاء</Button>
            <Button onClick={saveEdit} className="gap-1"><Save className="h-4 w-4" />حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bonus dialog */}
      <Dialog open={!!bonusTeacher} onOpenChange={(o) => !o && setBonusTeacher(null)}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5 text-amber-600" />
              إكرامية شهرية — {bonusTeacher}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-1">
                <Calendar className="h-4 w-4" /> العام الهجري
              </label>
              <Select value={bonusYear} onValueChange={setBonusYear}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: END_YEAR - START_YEAR + 1 }, (_, i) => START_YEAR + i).map(y => (
                    <SelectItem key={y} value={y.toString()}>{y}هـ</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">الشهر</label>
              <Select value={String(bonusMonth)} onValueChange={(v) => setBonusMonth(parseInt(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {HIJRI_MONTHS.map((m, i) => (
                    <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">المبلغ (ريال)</label>
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                value={bonusAmount}
                onChange={(e) => setBonusAmount(e.target.value)}
              />
            </div>

            <div className="bg-muted/50 rounded-md p-3 text-sm">
              <div className="font-semibold mb-1">إجمالي إكراميات {bonusYear}هـ:</div>
              <div className="text-primary font-bold text-lg">
                {bonuses
                  .filter(b => b.teacher_name === bonusTeacher && b.year === bonusYear)
                  .reduce((s, b) => s + Number(b.amount || 0), 0)
                  .toLocaleString()} ريال
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBonusTeacher(null)}>إغلاق</Button>
            <Button onClick={saveBonus} className="gap-1 bg-amber-600 hover:bg-amber-700 text-white">
              <Save className="h-4 w-4" /> حفظ الإكرامية
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Teachers;