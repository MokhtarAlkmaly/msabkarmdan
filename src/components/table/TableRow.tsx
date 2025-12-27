import { Student } from "@/types/student";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { useState, useEffect } from "react";
import {
  loadHifzHistory,
  saveHifzHistory,
  saveYearData,
  loadYearData,
  saveGlobalStudents,
  loadGlobalStudents,
} from "@/utils/storage";
import { calculateBaseHifz, calculateGrade, calculatePrize } from "@/utils/calculations";

interface Props {
  student: Student;
  index: number;
  currentYear: string;
  onUpdate: () => void;
  onDelete: (id: number) => void;
}

export const TableRow = ({ student, index, currentYear, onUpdate, onDelete }: Props) => {
  const currentYearNum = parseInt(currentYear);
  const [name, setName] = useState(student.name);
  const [teacher, setTeacher] = useState(student.teacher);
  const [history, setHistory] = useState(loadHifzHistory(student.id));
  const [yearData, setYearData] = useState(loadYearData(currentYear, student.id));

  // تحديد إذا كان العام السابق (فقط عرض البيانات المحفوظة) أو الحالي/جديد (إعادة الحساب)
  const isPastYear = currentYearNum < 1447; // الأعوام قبل 1447 فقط read-only

  // حساب القيم للعام الحالي فقط
  const baseHifz = isPastYear 
    ? parseFloat(yearData.baseHifz) || 0
    : calculateBaseHifz(history, currentYearNum);
  
  const parts = parseFloat(yearData.parts) || 0;
  
  const totalHifz = isPastYear
    ? parseFloat(yearData.totalHifz) || 0
    : baseHifz + parts;

  const annual = parseFloat(yearData.annual) || 0;
  const recitation = parseFloat(yearData.recitation) || 0;
  const memorization = parseFloat(yearData.memorization) || 0;
  
  const totalScore = isPastYear
    ? parseFloat(yearData.total) || 0
    : Math.min(annual + recitation + memorization, 100);

  const { grade: calculatedGrade, pricePerPart: calculatedPricePerPart } = calculateGrade(totalScore);
  
  const grade = isPastYear ? yearData.grade : calculatedGrade;
  const pricePerPart = isPastYear ? 0 : calculatedPricePerPart;
  const prize = isPastYear 
    ? parseFloat(yearData.prize) || 0
    : calculatePrize(parts, pricePerPart);

  const isActive = parts > 0 || totalScore > 0;

  useEffect(() => {
    // تحديث البيانات المحسوبة فقط للعام الحالي
    if (!isPastYear) {
      const updatedData = {
        ...yearData,
        baseHifz: baseHifz.toString(),
        totalHifz: totalHifz.toString(),
        total: totalScore.toString(),
        grade,
        prize: prize.toString(),
      };
      saveYearData(currentYear, student.id, updatedData);
    }
  }, [isPastYear, baseHifz, totalHifz, totalScore, grade, prize, currentYear, student.id]);

  const updateName = (value: string) => {
    setName(value);
    const students = loadGlobalStudents();
    const updated = students.map(s => s.id === student.id ? { ...s, name: value } : s);
    saveGlobalStudents(updated);
    onUpdate();
  };

  const updateTeacher = (value: string) => {
    setTeacher(value);
    const students = loadGlobalStudents();
    const updated = students.map(s => s.id === student.id ? { ...s, teacher: value } : s);
    saveGlobalStudents(updated);
    onUpdate();
  };

  const updateHistory = (year: keyof typeof history, value: string) => {
    const updated = { ...history, [year]: value };
    setHistory(updated);
    saveHifzHistory(student.id, updated);
    onUpdate();
  };

  const updateYearField = (field: keyof typeof yearData, value: string) => {
    // للأعوام السابقة، لا نسمح بالتعديل
    if (isPastYear) return;
    
    const updated = { ...yearData, [field]: value };
    setYearData(updated);
    saveYearData(currentYear, student.id, updated);
    onUpdate();
  };

  return (
    <tr className="hover:bg-accent/5 transition-colors">
      <td className="border border-border p-1 text-center font-semibold">{index}</td>
      
      <td className="border border-border p-1">
        <Input
          value={name}
          onChange={(e) => updateName(e.target.value)}
          placeholder="الاسم"
          className="text-center border-0 focus-visible:ring-1"
        />
      </td>

      <td className="border border-border p-1">
        <Input
          value={teacher}
          onChange={(e) => updateTeacher(e.target.value)}
          placeholder="المعلمة"
          className="text-center border-0 focus-visible:ring-1"
        />
      </td>

      {/* أعمدة السنوات السابقة */}
      {([1441, 1442, 1443, 1444, 1445, 1446] as const).map(year => {
        const key = `h${year}` as keyof typeof history;
        const isDisabled = year >= currentYearNum;
        return (
          <td key={year} className={`border border-border p-1 bg-accent/5 ${isDisabled ? 'opacity-30' : ''}`}>
            <Input
              type="number"
              value={history[key]}
              onChange={(e) => updateHistory(key, e.target.value)}
              disabled={isDisabled}
              placeholder="0"
              className="text-center border-0 focus-visible:ring-1 w-16"
            />
          </td>
        );
      })}


      {/* حفظ جديد */}
      <td className="border border-border p-1 bg-warning/10">
        <Input
          type="number"
          value={yearData.parts}
          onChange={(e) => updateYearField('parts', e.target.value)}
          placeholder="0"
          min="0"
          disabled={isPastYear}
          className="text-center border-0 focus-visible:ring-1 w-20 font-semibold"
        />
      </td>

      {/* الإجمالي التراكمي */}
      <td className="border border-border p-1 bg-islamic-green/10">
        <Input
          value={totalHifz}
          readOnly
          className="text-center border-0 bg-transparent font-bold text-islamic-green"
        />
      </td>

      {/* الدرجات */}
      <td className="border border-border p-1 bg-success/5">
        <Input
          type="number"
          value={yearData.annual}
          onChange={(e) => updateYearField('annual', e.target.value)}
          placeholder="0"
          min="0"
          max="20"
          disabled={isPastYear}
          className="text-center border-0 focus-visible:ring-1 w-16"
        />
      </td>

      <td className="border border-border p-1 bg-success/5">
        <Input
          type="number"
          value={yearData.recitation}
          onChange={(e) => updateYearField('recitation', e.target.value)}
          placeholder="0"
          min="0"
          max="20"
          disabled={isPastYear}
          className="text-center border-0 focus-visible:ring-1 w-16"
        />
      </td>

      <td className="border border-border p-1 bg-success/5">
        <Input
          type="number"
          value={yearData.memorization}
          onChange={(e) => updateYearField('memorization', e.target.value)}
          placeholder="0"
          min="0"
          max="60"
          disabled={isPastYear}
          className="text-center border-0 focus-visible:ring-1 w-16"
        />
      </td>

      <td className="border border-border p-1 bg-success/10">
        <Input
          value={totalScore}
          readOnly
          className="text-center border-0 bg-transparent font-bold"
        />
      </td>

      {/* الحالة */}
      <td className={`border border-border p-1 text-center font-semibold ${
        isActive ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive'
      }`}>
        {isActive ? 'نشط' : 'منقطع'}
      </td>

      {/* التقدير */}
      <td className="border border-border p-1 text-center font-semibold">
        {grade}
      </td>

      {/* المكافأة */}
      <td className="border border-border p-1 text-center font-semibold text-islamic-green">
        {prize.toLocaleString()}
      </td>

      {/* الترتيب */}
      <td className="border border-border p-1 text-center font-bold">
        {yearData.rank}
      </td>

      {/* حذف */}
      <td className="border border-border p-1 text-center">
        <Button
          variant="destructive"
          size="sm"
          onClick={() => onDelete(student.id)}
          className="h-7 w-7 p-0"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </td>
    </tr>
  );
};
