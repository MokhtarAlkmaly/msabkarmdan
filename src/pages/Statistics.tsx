import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowRight, BarChart3, TrendingUp, TrendingDown, Printer } from "lucide-react";
import { getCachedStudents, getCachedYearData, CachedYearData, CachedStudent } from "@/utils/localDB";
import { START_YEAR, END_YEAR } from "@/types/student";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

interface YearStat {
  year: string;
  students: number;
  parts: number;
  avgParts: number;
  avgTotal: number;
  khatm: number;
  excellent: number;
  prizes: number;
}

const num = (v: any) => parseFloat(v) || 0;
const pct = (cur: number, prev: number) => (prev > 0 ? ((cur - prev) / prev) * 100 : cur > 0 ? 100 : 0);
const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("ar-EG");

const Statistics = () => {
  const [rows, setRows] = useState<CachedYearData[]>([]);
  const [students, setStudents] = useState<CachedStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      const [yd, st] = await Promise.all([getCachedYearData(), getCachedStudents()]);
      setRows(yd);
      setStudents(st);
      setLoading(false);
    })();
  }, []);

  const stats: YearStat[] = useMemo(() => {
    const out: YearStat[] = [];
    for (let y = START_YEAR; y <= END_YEAR; y++) {
      const yr = y.toString();
      const yRows = rows.filter(r => r.year === yr);
      const active = yRows.filter(r => num(r.parts) > 0 || num(r.total) > 0);
      if (active.length === 0) continue;
      const parts = active.reduce((s, r) => s + num(r.parts), 0);
      const totals = active.map(r => num(r.total)).filter(t => t > 0);
      out.push({
        year: yr,
        students: active.length,
        parts,
        avgParts: active.length ? parts / active.length : 0,
        avgTotal: totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : 0,
        khatm: active.filter(r => num(r.total_hifz) >= 30).length,
        excellent: active.filter(r => num(r.total) >= 90).length,
        prizes: active.reduce((s, r) => s + num(r.prize), 0),
      });
    }
    return out;
  }, [rows]);

  const last = stats[stats.length - 1];
  const prev = stats[stats.length - 2];

  const nameById = useMemo(() => {
    const m = new Map<number, string>();
    students.forEach(s => m.set(s.id, s.name));
    return m;
  }, [students]);

  // progress per student across years
  const progress = useMemo(() => {
    const byStudent = new Map<number, { year: string; parts: number; totalHifz: number }[]>();
    rows.forEach(r => {
      const arr = byStudent.get(r.student_id) || [];
      arr.push({ year: r.year, parts: num(r.parts), totalHifz: num(r.total_hifz) });
      byStudent.set(r.student_id, arr);
    });
    const list = Array.from(byStudent.entries()).map(([id, arr]) => {
      const sorted = arr.sort((a, b) => a.year.localeCompare(b.year)).filter(a => a.parts > 0 || a.totalHifz > 0);
      const totalParts = sorted.reduce((s, a) => s + a.parts, 0);
      const bestHifz = Math.min(30, Math.max(0, ...sorted.map(a => a.totalHifz), totalParts));
      const lastP = sorted[sorted.length - 1]?.parts || 0;
      const prevP = sorted[sorted.length - 2]?.parts || 0;
      return {
        id,
        name: nameById.get(id) || "—",
        years: sorted.length,
        totalParts,
        bestHifz,
        completion: (bestHifz / 30) * 100,
        change: pct(lastP, prevP),
        lastYear: sorted[sorted.length - 1]?.year || "-",
      };
    }).filter(s => s.years > 0 && s.name !== "—");
    return list.sort((a, b) => b.bestHifz - a.bestHifz || b.totalParts - a.totalParts);
  }, [rows, nameById]);

  const filtered = progress.filter(p => p.name.includes(search.trim()));

  const KPI = ({ label, value, delta }: { label: string; value: string; delta?: number }) => (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className="text-2xl font-bold text-foreground">{value}</div>
      {delta !== undefined && prev && (
        <div className={`text-xs flex items-center gap-1 mt-1 ${delta >= 0 ? "text-success" : "text-destructive"}`}>
          {delta >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {fmt(Math.abs(delta))}% مقارنة بعام {prev.year}هـ
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <header className="bg-primary text-primary-foreground py-5 px-4 print:hidden">
        <div className="container mx-auto flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            الإحصائيات ومقارنة الأعوام
          </h1>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" className="gap-1" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> طباعة
            </Button>
            <Link to="/">
              <Button variant="secondary" size="sm" className="gap-1">
                <ArrowRight className="h-4 w-4" /> رجوع
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">جارٍ حساب الإحصائيات...</div>
        ) : stats.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">لا توجد بيانات كافية لعرض الإحصائيات</div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KPI label={`عدد الطالبات (${last.year}هـ)`} value={fmt(last.students)} delta={prev ? pct(last.students, prev.students) : undefined} />
              <KPI label="إجمالي الأجزاء المحفوظة" value={fmt(last.parts)} delta={prev ? pct(last.parts, prev.parts) : undefined} />
              <KPI label="متوسط الأجزاء للطالبة" value={fmt(last.avgParts)} delta={prev ? pct(last.avgParts, prev.avgParts) : undefined} />
              <KPI label="الخاتمات (٣٠ جزء)" value={fmt(last.khatm)} delta={prev ? pct(last.khatm, prev.khatm) : undefined} />
            </div>

            <section className="bg-card border border-border rounded-lg p-4">
              <h2 className="font-bold mb-3">تطور الحفظ بين الأعوام</h2>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                    <XAxis dataKey="year" reversed tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="parts" name="إجمالي الأجزاء" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="students" name="عدد الطالبات" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="bg-card border border-border rounded-lg p-4">
              <h2 className="font-bold mb-3">متوسط الدرجات ومتوسط الأجزاء</h2>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={stats}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                    <XAxis dataKey="year" reversed tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="avgTotal" name="متوسط الدرجة" stroke="hsl(var(--primary))" strokeWidth={2} />
                    <Line type="monotone" dataKey="avgParts" name="متوسط الأجزاء" stroke="hsl(var(--destructive))" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="bg-card border border-border rounded-lg p-4 overflow-x-auto">
              <h2 className="font-bold mb-3">مقارنة تفصيلية بين الأعوام</h2>
              <table className="w-full text-sm text-center border-collapse">
                <thead className="bg-muted">
                  <tr>
                    {["العام", "الطالبات", "الأجزاء", "متوسط الأجزاء", "متوسط الدرجة", "الخاتمات", "الممتازات", "الإكراميات", "نسبة التقدم"].map(h => (
                      <th key={h} className="border border-border p-2 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...stats].reverse().map((s, i, arr) => {
                    const before = arr[i + 1];
                    const change = before ? pct(s.parts, before.parts) : 0;
                    return (
                      <tr key={s.year} className="hover:bg-muted/40">
                        <td className="border border-border p-2 font-bold">{s.year}هـ</td>
                        <td className="border border-border p-2">{fmt(s.students)}</td>
                        <td className="border border-border p-2">{fmt(s.parts)}</td>
                        <td className="border border-border p-2">{fmt(s.avgParts)}</td>
                        <td className="border border-border p-2">{fmt(s.avgTotal)}</td>
                        <td className="border border-border p-2">{fmt(s.khatm)}</td>
                        <td className="border border-border p-2">{fmt(s.excellent)}</td>
                        <td className="border border-border p-2">{fmt(s.prizes)}</td>
                        <td className={`border border-border p-2 font-semibold ${!before ? "" : change >= 0 ? "text-success" : "text-destructive"}`}>
                          {before ? `${change >= 0 ? "+" : "-"}${fmt(Math.abs(change))}%` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>

            <section className="bg-card border border-border rounded-lg p-4">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <h2 className="font-bold">مدى تقدم الطالبات بالحفظ</h2>
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="بحث باسم الطالبة"
                  className="w-full sm:w-64 print:hidden"
                />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-center border-collapse">
                  <thead className="bg-muted">
                    <tr>
                      {["#", "اسم الطالبة", "أعوام المشاركة", "مجموع الأجزاء", "إجمالي الحفظ", "نسبة الإتمام", "آخر عام", "التغير"].map(h => (
                        <th key={h} className="border border-border p-2 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p, i) => (
                      <tr key={p.id} className="hover:bg-muted/40">
                        <td className="border border-border p-2">{i + 1}</td>
                        <td className="border border-border p-2 text-right font-semibold whitespace-nowrap">{p.name}</td>
                        <td className="border border-border p-2">{p.years}</td>
                        <td className="border border-border p-2">{fmt(p.totalParts)}</td>
                        <td className="border border-border p-2">{fmt(p.bestHifz)} / 30</td>
                        <td className="border border-border p-2">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-primary" style={{ width: `${Math.min(100, p.completion)}%` }} />
                            </div>
                            <span className="text-xs w-12">{fmt(p.completion)}%</span>
                          </div>
                        </td>
                        <td className="border border-border p-2">{p.lastYear}هـ</td>
                        <td className={`border border-border p-2 ${p.change >= 0 ? "text-success" : "text-destructive"}`}>
                          {p.change === 0 ? "—" : `${p.change >= 0 ? "+" : "-"}${fmt(Math.abs(p.change))}%`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
};

export default Statistics;
