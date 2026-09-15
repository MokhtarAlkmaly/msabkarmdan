import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { START_YEAR, END_YEAR, TRACKING_MONTHS } from "@/types/student";
import { StudentRegistryRow, loadStudentRegistryRow, resolveUserId } from "@/utils/studentRegistry";
import { getActiveYear, setActiveYear } from "@/utils/storage";
import { ArrowRight } from "lucide-react";

const years = Array.from({ length: END_YEAR - START_YEAR + 1 }, (_, i) => String(START_YEAR + i));

const Empty = ({ text }: { text: string }) => (
  <div className="py-10 text-center text-muted-foreground text-sm">{text}</div>
);

const Box = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg border border-border bg-card p-3 text-center">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="text-lg font-bold text-primary">{value || "—"}</div>
  </div>
);

const StudentProfile = () => {
  const { id } = useParams();
  const studentId = Number(id);
  const [student, setStudent] = useState<StudentRegistryRow | null>(null);
  const [year, setYear] = useState<string>(String(START_YEAR));
  const [loading, setLoading] = useState(true);

  const [monthly, setMonthly] = useState<any[]>([]);
  const [yearRow, setYearRow] = useState<any | null>(null);
  const [allYearRows, setAllYearRows] = useState<any[]>([]);
  const [awards, setAwards] = useState<any[]>([]);
  const [certs, setCerts] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      setYear(await getActiveYear());
      setStudent(await loadStudentRegistryRow(studentId));
    })();
  }, [studentId]);

  const loadYearScoped = useCallback(async () => {
    const userId = await resolveUserId();
    if (!userId || !student) return;
    setLoading(true);
    const name = student.name;
    const [m, y, ay, aw, ce] = await Promise.all([
      supabase.from("monthly_tracking").select("*").eq("user_id", userId)
        .eq("student_id", studentId).eq("year", year).order("month"),
      supabase.from("year_data").select("*").eq("user_id", userId)
        .eq("student_id", studentId).eq("year", year).maybeSingle(),
      supabase.from("year_data").select("*").eq("user_id", userId)
        .eq("student_id", studentId).order("year"),
      supabase.from("awards").select("*").eq("user_id", userId)
        .eq("year", year).eq("recipient_name", name).order("awarded_at"),
      supabase.from("certificates").select("*").eq("user_id", userId)
        .eq("year", year).eq("recipient_name", name).order("issued_at"),
    ]);
    setMonthly(m.data || []);
    setYearRow(y.data || null);
    setAllYearRows(ay.data || []);
    setAwards(aw.data || []);
    setCerts(ce.data || []);
    setLoading(false);
  }, [student, studentId, year]);

  useEffect(() => { loadYearScoped(); }, [loadYearScoped]);

  const monthlyTotals = useMemo(
    () => monthly.map(r => ({
      month: r.month,
      total:
        Number(r.memorization_hifz_score || 0) + Number(r.memorization_recitation_score || 0) +
        Number(r.review_hifz_score || 0) + Number(r.review_recitation_score || 0) +
        Number(r.attendance_score || 0) + Number(r.behavior_score || 0),
    })),
    [monthly]
  );

  const actions = (
    <>
      <Button size="sm" variant="secondary" className="gap-1" asChild>
        <Link to="/"><ArrowRight className="h-4 w-4" /> سجل الطلاب</Link>
      </Button>
      <div className="flex items-center gap-2">
        <span className="text-xs sm:text-sm">عام المسابقة:</span>
        <Select value={year} onValueChange={async (v) => { setYear(v); await setActiveYear(v); }}>
          <SelectTrigger className="h-8 w-24 bg-background text-foreground"><SelectValue /></SelectTrigger>
          <SelectContent>
            {years.map(y => <SelectItem key={y} value={y}>{y}هـ</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <Button size="sm" variant="secondary" onClick={() => window.print()}>طباعة</Button>
    </>
  );

  return (
    <AppLayout
      title={student?.name || "ملف الطالب"}
      subtitle={`ملف الطالب — ${year}هـ`}
      actions={actions}
    >
      {!student ? (
        <Empty text="لم يتم العثور على الطالب" />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Box label="المعلمة" value={yearRow?.teacher || student.teacher} />
            <Box label="تاريخ الالتحاق" value={student.join_date_hijri || ""} />
            <Box label="الحفظ قبل الالتحاق" value={String(student.prior_hifz || 0)} />
            <Box label="الحالة" value={student.status || ""} />
          </div>

          <Tabs defaultValue="monthly" dir="rtl">
            <TabsList className="flex flex-wrap h-auto">
              <TabsTrigger value="monthly">المتابعة الشهرية</TabsTrigger>
              <TabsTrigger value="competition">المسابقة الرمضانية</TabsTrigger>
              <TabsTrigger value="awards">الإكراميات والجوائز</TabsTrigger>
              <TabsTrigger value="certs">الشهادات</TabsTrigger>
              <TabsTrigger value="internal">المسابقات الداخلية</TabsTrigger>
              <TabsTrigger value="external">المسابقات الخارجية</TabsTrigger>
              <TabsTrigger value="stats">الإحصائيات</TabsTrigger>
            </TabsList>

            <TabsContent value="monthly">
              {loading ? <Empty text="جارٍ التحميل..." /> : monthly.length === 0 ? (
                <Empty text={`لا توجد متابعات شهرية في ${year}هـ`} />
              ) : (
                <div className="rounded-lg border border-border bg-card overflow-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead className="bg-primary text-primary-foreground">
                      <tr>
                        <th className="border border-border p-2">الشهر</th>
                        <th className="border border-border p-2">تسميع الحفظ</th>
                        <th className="border border-border p-2">تلاوة الحفظ</th>
                        <th className="border border-border p-2">تسميع المراجعة</th>
                        <th className="border border-border p-2">تلاوة المراجعة</th>
                        <th className="border border-border p-2">المواظبة</th>
                        <th className="border border-border p-2">السلوك</th>
                        <th className="border border-border p-2">المجموع</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthly.map(r => (
                        <tr key={r.id} className="text-center">
                          <td className="border border-border p-2 font-semibold">
                            {TRACKING_MONTHS.find(m => m.value === r.month)?.label || r.month}
                          </td>
                          <td className="border border-border p-2">{r.memorization_hifz_score}</td>
                          <td className="border border-border p-2">{r.memorization_recitation_score}</td>
                          <td className="border border-border p-2">{r.review_hifz_score}</td>
                          <td className="border border-border p-2">{r.review_recitation_score}</td>
                          <td className="border border-border p-2">{r.attendance_score}</td>
                          <td className="border border-border p-2">{r.behavior_score}</td>
                          <td className="border border-border p-2 font-bold text-primary">
                            {monthlyTotals.find(t => t.month === r.month)?.total ?? 0}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="competition">
              {!yearRow ? <Empty text={`الطالب غير مسجّل في مسابقة ${year}هـ`} /> : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Box label="الحفظ السابق" value={yearRow.base_hifz} />
                  <Box label="إجمالي الحفظ" value={yearRow.total_hifz} />
                  <Box label="الأجزاء" value={yearRow.parts} />
                  <Box label="الحفظ السنوي" value={yearRow.annual} />
                  <Box label="التلاوة" value={yearRow.recitation} />
                  <Box label="التسميع" value={yearRow.memorization} />
                  <Box label="المجموع" value={yearRow.total} />
                  <Box label="التقدير" value={yearRow.grade} />
                  <Box label="الجائزة" value={yearRow.prize} />
                  <Box label="جائزة الحالة" value={yearRow.status_prize} />
                  <Box label="الترتيب" value={yearRow.rank} />
                </div>
              )}
            </TabsContent>

            <TabsContent value="awards">
              {awards.length === 0 ? <Empty text={`لا توجد إكراميات في ${year}هـ`} /> : (
                <div className="space-y-2">
                  {awards.map(a => (
                    <div key={a.id} className="rounded-lg border border-border bg-card p-3 flex flex-wrap gap-2 justify-between text-sm">
                      <span className="font-semibold">{a.award_type}</span>
                      <span>{a.award_kind === "cash" ? `${a.amount} ريال` : a.item || "عينية"}</span>
                      <span className="text-muted-foreground">{a.awarded_at}</span>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="certs">
              {certs.length === 0 ? <Empty text={`لا توجد شهادات في ${year}هـ`} /> : (
                <div className="space-y-2">
                  {certs.map(c => (
                    <div key={c.id} className="rounded-lg border border-border bg-card p-3 flex flex-wrap gap-2 justify-between text-sm">
                      <span className="font-semibold">{c.title}</span>
                      <span>{c.cert_type}</span>
                      <span className="text-muted-foreground">{c.issued_at}</span>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="internal">
              <Empty text="صفحة المسابقات الداخلية ستُضاف لاحقاً" />
            </TabsContent>
            <TabsContent value="external">
              <Empty text="صفحة المسابقات الخارجية ستُضاف لاحقاً" />
            </TabsContent>

            <TabsContent value="stats">
              {allYearRows.length === 0 ? <Empty text="لا توجد بيانات سنوية للمقارنة" /> : (
                <div className="rounded-lg border border-border bg-card overflow-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead className="bg-primary text-primary-foreground">
                      <tr>
                        <th className="border border-border p-2">العام</th>
                        <th className="border border-border p-2">إجمالي الحفظ</th>
                        <th className="border border-border p-2">الحفظ السنوي</th>
                        <th className="border border-border p-2">المجموع</th>
                        <th className="border border-border p-2">التقدير</th>
                        <th className="border border-border p-2">الترتيب</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allYearRows.map(r => (
                        <tr key={r.id} className="text-center">
                          <td className="border border-border p-2 font-semibold">{r.year}هـ</td>
                          <td className="border border-border p-2">{r.total_hifz}</td>
                          <td className="border border-border p-2">{r.annual}</td>
                          <td className="border border-border p-2">{r.total}</td>
                          <td className="border border-border p-2">{r.grade}</td>
                          <td className="border border-border p-2">{r.rank}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </>
      )}
    </AppLayout>
  );
};

export default StudentProfile;
