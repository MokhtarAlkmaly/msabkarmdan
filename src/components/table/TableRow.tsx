import { Student } from "@/types/student";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { StudentReport } from "@/components/StudentReport";
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

  // حساب الحفظ السابق (مجموع الحفظ من 1441 حتى العام السابق لهذا العام)
  const baseHifz = calculateBaseHifz(history, currentYearNum);
  
  const parts = parseFloat(yearData.parts) || 0;
  
  // الإجمالي التراكمي = الحفظ السابق + الحفظ الجديد لهذا العام
  const totalHifz = Math.min(baseHifz + parts, 30);

  const annual = parseFloat(yearData.annual) || 0;
  const recitation = parseFloat(yearData.recitation) || 0;
  const memorization = parseFloat(yearData.memorization) || 0;
  
  const totalScore = Math.min(annual + recitation + memorization, 100);

  const { grade, pricePerPart } = calculateGrade(totalScore);
  const prize = calculatePrize(parts, pricePerPart);

  const isActive = parts > 0 || totalScore > 0;
  
  // التحقق إذا كانت الطالبة خاتمة (أتمت 30 جزء)
  const isKhatim = totalHifz >= 30;

  useEffect(() => {
    // تحديث البيانات المحسوبة
    const updatedData = {
      ...yearData,
      baseHifz: baseHifz.toString(),
      totalHifz: totalHifz.toString(),
      total: totalScore.toString(),
      grade,
      prize: prize.toString(),
    };
    saveYearData(currentYear, student.id, updatedData);
  }, [baseHifz, totalHifz, totalScore, grade, prize, currentYear, student.id]);

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

      {/* الحفظ السابق */}
      <td className="border border-border p-1 bg-accent/10 text-center font-semibold">
        {baseHifz > 0 ? baseHifz : '-'}
      </td>

      {/* حفظ جديد */}
      <td className="border border-border p-1 bg-warning/10">
        <Input
          type="number"
          value={yearData.parts}
          onChange={(e) => updateYearField('parts', e.target.value)}
          placeholder="0"
          min="0"
          className="text-center border-0 focus-visible:ring-1 w-20 font-semibold"
        />
      </td>

      {/* الإجمالي التراكمي */}
      <td className={`border border-border p-1 ${isKhatim ? 'bg-islamic-gold/20' : 'bg-islamic-green/10'}`}>
        {isKhatim ? (
          <span className="text-center font-bold text-islamic-gold block">خاتم ✨</span>
        ) : (
          <Input
            value={totalHifz}
            readOnly
            className="text-center border-0 bg-transparent font-bold text-islamic-green"
          />
        )}
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

      {/* المكافأة حسب الحالة */}
      <td className="border border-border p-1">
        <Input
          type="number"
          value={yearData.statusPrize || ''}
          onChange={(e) => updateYearField('statusPrize', e.target.value)}
          placeholder="0"
          min="0"
          className="text-center border-0 focus-visible:ring-1 w-20 font-semibold"
        />
      </td>

      {/* الترتيب */}
      <td className="border border-border p-1 text-center font-bold">
        {yearData.rank}
      </td>

      {/* تقرير */}
      <td className="border border-border p-1 text-center">
        <StudentReport student={student} />
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
