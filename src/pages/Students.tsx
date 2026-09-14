import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Save, Search, Columns3, Trash2, UserPlus, Printer } from "lucide-react";
import { START_YEAR, END_YEAR } from "@/types/student";
import {
  StudentRegistryRow, CustomColumn, loadStudentRegistry, loadCustomColumns,
  loadStatuses, addStatus, addCustomColumn, deleteCustomColumn, saveStudentRegistryRow,
} from "@/utils/studentRegistry";
import {
  getActiveYear, setActiveYear, saveStudent, deleteStudent,
  registerStudentInYear, syncToCloud, isViewingOtherCenter,
} from "@/utils/storage";

const years = Array.from({ length: END_YEAR - START_YEAR + 1 }, (_, i) => String(START_YEAR + i));

const Students = () => {
  const { toast } = useToast();
  const [rows, setRows] = useState<StudentRegistryRow[]>([]);
  const [columns, setColumns] = useState<CustomColumn[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [year, setYear] = useState<string>(String(START_YEAR));
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState<Record<number, true>>({});

  const [newStatus, setNewStatus] = useState("");
  const [statusOpen, setStatusOpen] = useState(false);
  const [colOpen, setColOpen] = useState(false);
  const [colLabel, setColLabel] = useState("");
  const [colType, setColType] = useState<"text" | "number" | "date">("text");

  const readOnly = isViewingOtherCenter();

  const load = useCallback(async () => {
    setLoading(true);
    const [r, c, s] = await Promise.all([loadStudentRegistry(), loadCustomColumns(), loadStatuses()]);
    setRows(r);
    setColumns(c);
    setStatuses(s);
    setDirty({});
    setLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      setYear(await getActiveYear());
      await load();
    })();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return rows;
    return rows.filter(r => (r.name || "").includes(q));
  }, [rows, query]);

  const patch = (id: number, field: keyof StudentRegistryRow, value: any) => {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } : r)));
    setDirty(prev => ({ ...prev, [id]: true }));
  };

  const patchExtra = (id: number, key: string, value: string) => {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, extra: { ...r.extra, [key]: value } } : r)));
    setDirty(prev => ({ ...prev, [id]: true }));
  };

  const handleSave = async () => {
    const ids = Object.keys(dirty).map(Number);
    if (!ids.length) return;
    setSaving(true);
    let ok = 0;
    for (const id of ids) {
      const row = rows.find(r => r.id === id);
      if (!row) continue;
      if (await saveStudentRegistryRow(row)) ok++;
    }
    setSaving(false);
    setDirty({});
    toast({ title: "تم الحفظ", description: `تم حفظ بيانات ${ok} طالب` });
  };

  const handleAddStudent = async () => {
    const id = await saveStudent({ name: "", teacher: "" });
    if (!id) {
      toast({ title: "تعذّر الإضافة", variant: "destructive" });
      return;
    }
    await syncToCloud();
    await load();
    toast({ title: "تمت الإضافة", description: "أضِف بيانات الطالب الجديد ثم اضغط حفظ" });
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`حذف «${name || "بدون اسم"}» من سجل الطلاب؟`)) return;
    await deleteStudent(id);
    await syncToCloud();
    await load();
    toast({ title: "تم الحذف", variant: "destructive" });
  };

  const handleRecall = async (id: number) => {
    await registerStudentInYear(year, id);
    await syncToCloud();
    toast({ title: "تم الاستدعاء", description: `تم تسجيل الطالب في عام ${year}هـ` });
  };

  const handleAddStatus = async () => {
    if (!(await addStatus(newStatus))) {
      toast({ title: "تعذّر إضافة الحالة", variant: "destructive" });
      return;
    }
    setStatuses(await loadStatuses());
    setNewStatus("");
    setStatusOpen(false);
  };

  const handleAddColumn = async () => {
    if (!(await addCustomColumn(colLabel, colType, columns.length))) {
      toast({ title: "تعذّر إضافة العمود", variant: "destructive" });
      return;
    }
    setColumns(await loadCustomColumns());
    setColLabel("");
    setColOpen(false);
  };

  const handleDeleteColumn = async (col: CustomColumn) => {
    if (!confirm(`حذف عمود «${col.label}»؟ ستبقى القيم المخزّنة دون عرض.`)) return;
    await deleteCustomColumn(col.id);
    setColumns(await loadCustomColumns());
  };

  const actions = (
    <>
      <div className="flex items-center gap-2">
        <span className="text-xs sm:text-sm">عام المسابقة:</span>
        <Select
          value={year}
          onValueChange={async (v) => { setYear(v); await setActiveYear(v); }}
        >
          <SelectTrigger className="h-8 w-24 bg-background text-foreground">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map(y => <SelectItem key={y} value={y}>{y}هـ</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {!readOnly && (
        <>
          <Button size="sm" variant="secondary" className="gap-1" onClick={handleAddStudent}>
            <Plus className="h-4 w-4" /> طالب جديد
          </Button>

          <Dialog open={colOpen} onOpenChange={setColOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="secondary" className="gap-1">
                <Columns3 className="h-4 w-4" /> إضافة عمود
              </Button>
            </DialogTrigger>
            <DialogContent dir="rtl">
              <DialogHeader><DialogTitle>إضافة عمود جديد</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>اسم العمود</Label>
                  <Input value={colLabel} onChange={e => setColLabel(e.target.value)} placeholder="مثال: العنوان" />
                </div>
                <div className="space-y-1">
                  <Label>نوع البيانات</Label>
                  <Select value={colType} onValueChange={(v: any) => setColType(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">نص</SelectItem>
                      <SelectItem value="number">رقم</SelectItem>
                      <SelectItem value="date">تاريخ</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleAddColumn} disabled={!colLabel.trim()}>إضافة</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="secondary" className="gap-1">
                <UserPlus className="h-4 w-4" /> إضافة حالة
              </Button>
            </DialogTrigger>
            <DialogContent dir="rtl">
              <DialogHeader><DialogTitle>إضافة حالة جديدة</DialogTitle></DialogHeader>
              <Input value={newStatus} onChange={e => setNewStatus(e.target.value)} placeholder="مثال: من أسرة نازحة" />
              <DialogFooter>
                <Button onClick={handleAddStatus} disabled={!newStatus.trim()}>إضافة</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Button size="sm" className="gap-1" onClick={handleSave} disabled={saving || !Object.keys(dirty).length}>
            <Save className="h-4 w-4" />
            {saving ? "جارٍ الحفظ..." : "حفظ التغييرات"}
          </Button>
        </>
      )}

      <Button size="sm" variant="secondary" className="gap-1" onClick={() => window.print()}>
        <Printer className="h-4 w-4" /> طباعة
      </Button>
    </>
  );

  return (
    <AppLayout title="سجل الطلاب" subtitle={`جميع الطلاب المسجلين — ${rows.length} طالب`} actions={actions}>
      <div className="mb-3 relative max-w-sm print:hidden">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="بحث بالاسم" className="pr-10" />
      </div>

      {columns.length > 0 && !readOnly && (
        <div className="mb-3 flex flex-wrap gap-2 print:hidden">
          {columns.map(c => (
            <Button key={c.id} variant="outline" size="sm" className="gap-1 h-7 text-xs"
              onClick={() => handleDeleteColumn(c)}>
              <Trash2 className="h-3 w-3" /> {c.label}
            </Button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-muted-foreground">جارٍ التحميل...</div>
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-auto max-h-[70vh]">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-20 bg-primary text-primary-foreground">
              <tr>
                <th className="border border-border p-2 w-[50px]">م</th>
                <th className="border border-border p-2 min-w-[200px]">اسم الطالب</th>
                <th className="border border-border p-2 min-w-[130px]">تاريخ الالتحاق (هجري)</th>
                <th className="border border-border p-2 min-w-[110px]">الحفظ قبل الالتحاق</th>
                <th className="border border-border p-2 min-w-[140px]">الحالة</th>
                <th className="border border-border p-2 min-w-[130px]">السنة الدراسية</th>
                <th className="border border-border p-2 min-w-[130px]">رقم ولي الأمر</th>
                <th className="border border-border p-2 min-w-[130px]">رقم الطالب</th>
                {columns.map(c => (
                  <th key={c.id} className="border border-border p-2 min-w-[130px]">{c.label}</th>
                ))}
                <th className="border border-border p-2 min-w-[110px] print:hidden">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={r.id} className="hover:bg-accent/5">
                  <td className="border border-border p-1 text-center font-semibold">{i + 1}</td>
                  <td className="border border-border p-1">
                    <div className="flex items-center gap-1">
                      <Input
                        value={r.name}
                        onChange={e => patch(r.id, "name", e.target.value)}
                        readOnly={readOnly}
                        className="text-center border-0 focus-visible:ring-1"
                        placeholder="الاسم"
                      />
                      <Link to={`/students/${r.id}`} className="text-primary text-xs underline shrink-0 print:hidden">
                        ملف
                      </Link>
                    </div>
                  </td>
                  <td className="border border-border p-1">
                    <Input
                      value={r.join_date_hijri || ""}
                      onChange={e => patch(r.id, "join_date_hijri", e.target.value)}
                      readOnly={readOnly}
                      placeholder="1445/03/10"
                      className="text-center border-0 focus-visible:ring-1"
                    />
                  </td>
                  <td className="border border-border p-1 bg-accent/10">
                    <Input
                      type="number" min="0" max="30" step="0.5"
                      value={r.prior_hifz || ""}
                      onChange={e => patch(r.id, "prior_hifz", parseFloat(e.target.value) || 0)}
                      readOnly={readOnly}
                      placeholder="0"
                      className="text-center border-0 focus-visible:ring-1 font-semibold"
                    />
                  </td>
                  <td className="border border-border p-1">
                    <Select
                      value={r.status || "__none__"}
                      onValueChange={v => patch(r.id, "status", v === "__none__" ? null : v)}
                      disabled={readOnly}
                    >
                      <SelectTrigger className="h-8 border-0 focus:ring-1"><SelectValue placeholder="الحالة" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— بدون —</SelectItem>
                        {r.status && !statuses.includes(r.status) && (
                          <SelectItem value={r.status}>{r.status}</SelectItem>
                        )}
                        {statuses.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="border border-border p-1">
                    <Input
                      value={r.school_year || ""}
                      onChange={e => patch(r.id, "school_year", e.target.value)}
                      readOnly={readOnly}
                      placeholder="الصف السادس"
                      className="text-center border-0 focus-visible:ring-1"
                    />
                  </td>
                  <td className="border border-border p-1">
                    <Input
                      value={r.guardian_phone || ""}
                      onChange={e => patch(r.id, "guardian_phone", e.target.value)}
                      readOnly={readOnly}
                      dir="ltr"
                      className="text-center border-0 focus-visible:ring-1"
                    />
                  </td>
                  <td className="border border-border p-1">
                    <Input
                      value={r.student_phone || ""}
                      onChange={e => patch(r.id, "student_phone", e.target.value)}
                      readOnly={readOnly}
                      dir="ltr"
                      className="text-center border-0 focus-visible:ring-1"
                    />
                  </td>
                  {columns.map(c => (
                    <td key={c.id} className="border border-border p-1">
                      <Input
                        type={c.col_type === "number" ? "number" : "text"}
                        value={r.extra?.[c.key] || ""}
                        onChange={e => patchExtra(r.id, c.key, e.target.value)}
                        readOnly={readOnly}
                        className="text-center border-0 focus-visible:ring-1"
                      />
                    </td>
                  ))}
                  <td className="border border-border p-1 print:hidden">
                    <div className="flex items-center justify-center gap-1">
                      <Button size="sm" variant="secondary" className="h-7 px-2 text-xs"
                        onClick={() => handleRecall(r.id)} disabled={readOnly}>
                        استدعاء
                      </Button>
                      <Button size="sm" variant="destructive" className="h-7 w-7 p-0"
                        onClick={() => handleDelete(r.id, r.name)} disabled={readOnly}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9 + columns.length} className="p-8 text-center text-muted-foreground">
                    لا يوجد طلاب — اضغط «طالب جديد» للإضافة
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </AppLayout>
  );
};

export default Students;
