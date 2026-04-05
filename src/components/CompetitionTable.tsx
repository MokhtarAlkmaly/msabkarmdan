import { useState, useMemo, useCallback } from "react";
import { Student, HifzHistory, YearData } from "@/types/student";
import { TableHeader } from "./table/TableHeader";
import { SortField, SortDirection } from "./table/TableHeader";
import { TableRow } from "./table/TableRow";
import { TableFilters } from "./table/TableFilters";
import { calculateGrade, calculateBaseHifz } from "@/utils/calculations";
import logo from "@/assets/logo.png";

interface DirtyData {
  name: string;
  teacher: string;
  history: HifzHistory;
  yearData: YearData;
}

interface Props {
  students: Student[];
  currentYear: string;
  onUpdate: () => void;
  onDelete: (id: number) => void;
  dirtyMap: Record<number, DirtyData>;
  onDirtyChange: (studentId: number, data: DirtyData) => void;
}

export const CompetitionTable = ({ students, currentYear, onUpdate, onDelete, dirtyMap, onDirtyChange }: Props) => {
  const [selectedTeacher, setSelectedTeacher] = useState<string>("all");
  const [nameFilter, setNameFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [gradeFilter, setGradeFilter] = useState<string>("all");
  const [partsFilter, setPartsFilter] = useState<string>("");
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      if (sortDirection === 'asc') setSortDirection('desc');
      else if (sortDirection === 'desc') { setSortField(null); setSortDirection(null); }
      else setSortDirection('asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  }, [sortField, sortDirection]);

  const teachers = useMemo(() => {
    const uniqueTeachers = Array.from(new Set(students.map(s => s.teacher).filter(Boolean)));
    return uniqueTeachers.sort((a, b) => a.localeCompare(b, 'ar'));
  }, [students]);

  const currentYearNum = parseInt(currentYear);

  const getStudentSortValue = useCallback((student: Student, field: SortField): string | number => {
    const parts = parseFloat(student.yearData?.parts || '0');
    const totalScore = parseFloat(student.yearData?.total || '0');
    const isActive = parts > 0 || totalScore > 0;
    const baseHifz = calculateBaseHifz(student.hifzHistory || {}, currentYearNum);

    switch (field) {
      case 'name': return student.name || '';
      case 'teacher': return student.teacher || '';
      case 'baseHifz': return baseHifz;
      case 'parts': return parts;
      case 'totalHifz': return Math.min(baseHifz + parts, 30);
      case 'annual': return parseFloat(student.yearData?.annual || '0');
      case 'recitation': return parseFloat(student.yearData?.recitation || '0');
      case 'memorization': return parseFloat(student.yearData?.memorization || '0');
      case 'total': return totalScore;
      case 'status': return isActive ? 1 : 0;
      case 'grade': {
        const { grade } = calculateGrade(totalScore);
        const order: Record<string, number> = { 'ممتاز': 5, 'جيد جداً': 4, 'جيد': 3, 'مقبول': 2, 'ضعيف': 1, '': 0 };
        return order[grade] || 0;
      }
      case 'prize': return parseFloat(student.yearData?.prize || '0');
      case 'statusPrize': return parseFloat(student.yearData?.statusPrize || '0');
      case 'rank': return parseFloat(student.yearData?.rank || '0') || 9999;
      default: return 0;
    }
  }, [currentYearNum]);

  const filteredStudents = useMemo(() => {
    const filtered = students.filter(student => {
      if (selectedTeacher !== "all" && student.teacher !== selectedTeacher) return false;
      if (nameFilter && !student.name.includes(nameFilter)) return false;

      const parts = parseFloat(student.yearData?.parts || '0');
      const total = parseFloat(student.yearData?.total || '0');
      const isActive = parts > 0 || total > 0;

      if (statusFilter !== "all") {
        if (statusFilter === "active" && !isActive) return false;
        if (statusFilter === "inactive" && isActive) return false;
      }

      if (gradeFilter !== "all") {
        const totalScore = parseFloat(student.yearData?.total || '0');
        const { grade } = calculateGrade(totalScore);
        if (grade !== gradeFilter) return false;
      }

      if (partsFilter) {
        const minParts = parseFloat(partsFilter) || 0;
        if (parts < minParts) return false;
      }

      return true;
    });

    if (sortField && sortDirection) {
      filtered.sort((a, b) => {
        const aVal = getStudentSortValue(a, sortField);
        const bVal = getStudentSortValue(b, sortField);
        const cmp = typeof aVal === 'string' ? aVal.localeCompare(bVal as string, 'ar') : (aVal as number) - (bVal as number);
        return sortDirection === 'asc' ? cmp : -cmp;
      });
    }

    return filtered;
  }, [students, selectedTeacher, nameFilter, statusFilter, gradeFilter, partsFilter, sortField, sortDirection, getStudentSortValue]);

  const hasFilters = selectedTeacher !== "all" || nameFilter !== "" || statusFilter !== "all" || gradeFilter !== "all" || partsFilter !== "";

  const getFilterDescription = () => {
    const parts: string[] = [];
    if (selectedTeacher !== "all") parts.push(`المعلمة: ${selectedTeacher}`);
    if (statusFilter !== "all") parts.push(`الحالة: ${statusFilter === "active" ? "نشط" : "منقطع"}`);
    if (gradeFilter !== "all") parts.push(`التقدير: ${gradeFilter}`);
    if (partsFilter) parts.push(`الحفظ الجديد ≥ ${partsFilter}`);
    if (nameFilter) parts.push(`الاسم: ${nameFilter}`);
    return parts.join(" | ");
  };

  const handlePrintFiltered = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const rows = filteredStudents.map((s, i) => {
      const parts = parseFloat(s.yearData?.parts || '0');
      const totalScore = parseFloat(s.yearData?.total || '0');
      const isActive = parts > 0 || totalScore > 0;
      const { grade } = calculateGrade(totalScore);
      const prize = parseFloat(s.yearData?.prize || '0');
      const statusPrize = parseFloat(s.yearData?.statusPrize || '0');

      return `<tr>
        <td>${i + 1}</td>
        <td>${s.name}</td>
        <td>${s.teacher}</td>
        <td>${s.yearData?.baseHifz || '-'}</td>
        <td>${s.yearData?.parts || '-'}</td>
        <td>${s.yearData?.totalHifz || '-'}</td>
        <td>${s.yearData?.annual || '-'}</td>
        <td>${s.yearData?.recitation || '-'}</td>
        <td>${s.yearData?.memorization || '-'}</td>
        <td>${totalScore || '-'}</td>
        <td class="${isActive ? 'active' : 'inactive'}">${isActive ? 'نشط' : 'منقطع'}</td>
        <td>${grade || '-'}</td>
        <td>${prize.toLocaleString()}</td>
        <td>${statusPrize.toLocaleString()}</td>
      </tr>`;
    }).join('');

    const totalPrize = filteredStudents.reduce((sum, s) => sum + (parseFloat(s.yearData?.prize || '0')), 0);
    const totalStatusPrize = filteredStudents.reduce((sum, s) => sum + (parseFloat(s.yearData?.statusPrize || '0')), 0);

    printWindow.document.write(`
      <html dir="rtl"><head><title>تقرير مصفى - ${currentYear}هـ</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; padding: 20px; color: #1a3a2a; }
        .header { text-align: center; margin-bottom: 20px; border-bottom: 3px solid #2d7a52; padding-bottom: 12px; }
        .header img { height: 80px; margin-bottom: 8px; }
        .header h1 { font-size: 20px; color: #2d7a52; }
        .header h2 { font-size: 16px; color: #555; margin-top: 4px; }
        .filter-info { background: #f0f7f3; padding: 10px; border-radius: 8px; margin-bottom: 16px; font-size: 14px; }
        .filter-info strong { color: #2d7a52; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th { background: #2d7a52; color: white; padding: 6px 3px; border: 1px solid #1a5a38; }
        td { padding: 5px 3px; border: 1px solid #ccc; text-align: center; }
        tr:nth-child(even) { background: #f9fdfb; }
        .total-row { background: #e8f5ee !important; font-weight: bold; }
        .total-row td { border-top: 2px solid #2d7a52; }
        .active { color: #16a34a; font-weight: bold; }
        .inactive { color: #dc2626; font-weight: bold; }
        .footer { text-align: center; margin-top: 20px; font-size: 11px; color: #888; }
        .count { margin-bottom: 10px; font-size: 13px; }
        @media print { body { padding: 10px; } @page { size: landscape; margin: 10mm; } }
      </style></head><body>
        <div class="header">
          <img src="${logo}" alt="الشعار" />
          <h1>مركز إنماء الأهلي الخيري</h1>
          <h2>كشف المسابقة الرمضانية - ${currentYear}هـ</h2>
        </div>
        <div class="filter-info"><strong>التصفية:</strong> ${getFilterDescription()}</div>
        <div class="count">عدد الطالبات: <strong>${filteredStudents.length}</strong></div>
        <table>
          <thead><tr>
            <th>م</th><th>الاسم</th><th>المعلمة</th><th>الحفظ السابق</th><th>حفظ جديد</th>
            <th>الإجمالي</th><th>سنة</th><th>تلاوة</th><th>حفظ</th><th>المجموع</th>
            <th>الحالة</th><th>التقدير</th><th>المكافأة</th><th>المكافأة حسب الحالة</th>
          </tr></thead>
          <tbody>
            ${rows}
            <tr class="total-row">
              <td colspan="12">إجمالي المكافآت</td>
              <td>${totalPrize.toLocaleString()}</td>
              <td>${totalStatusPrize.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
        <div class="footer">تصميم أ/ مختار الكمالي - ${new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
      </body></html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  return (
    <div className="space-y-4">
      <TableFilters
        teachers={teachers}
        selectedTeacher={selectedTeacher}
        onTeacherChange={setSelectedTeacher}
        nameFilter={nameFilter}
        onNameFilterChange={setNameFilter}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        gradeFilter={gradeFilter}
        onGradeFilterChange={setGradeFilter}
        partsFilter={partsFilter}
        onPartsFilterChange={setPartsFilter}
        onPrintFiltered={handlePrintFiltered}
        hasFilters={hasFilters}
      />

      <div className="overflow-x-auto rounded-lg border border-border shadow-lg">
        <table className="w-full border-collapse bg-card text-sm whitespace-nowrap table-fixed min-w-[1400px]">
          <TableHeader currentYear={currentYear} sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
          <tbody>
            {filteredStudents.map((student, index) => (
              <TableRow
                key={`${student.id}-${currentYear}`}
                student={student}
                index={index + 1}
                currentYear={currentYear}
                onDelete={onDelete}
                onDirtyChange={onDirtyChange}
              />
            ))}
          </tbody>
        </table>
      </div>

      {filteredStudents.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          لا توجد بيانات تطابق معايير البحث
        </div>
      )}
    </div>
  );
};
