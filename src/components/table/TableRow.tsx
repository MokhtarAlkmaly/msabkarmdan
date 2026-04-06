import { Student } from "@/types/student";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { StudentReport } from "@/components/StudentReport";
import { useState, useEffect, useCallback } from "react";
import { calculateBaseHifz, calculateGrade, calculatePrize } from "@/utils/calculations";
import { HifzHistory, YearData } from "@/types/student";

interface Props {
  student: Student;
  index: number;
  currentYear: string;
  onDelete: (id: number) => void;
  onDirtyChange: (studentId: number, data: { name: string; teacher: string; history: HifzHistory; yearData: YearData }) => void;
}

export const TableRow = ({ student, index, currentYear, onDelete, onDirtyChange }: Props) => {
  const currentYearNum = parseInt(currentYear);
  const [name, setName] = useState(student.name);
  const [history, setHistory] = useState<HifzHistory>(student.hifzHistory || {});
  const [yearData, setYearData] = useState<YearData>(student.yearData || {
    baseHifz: '0', totalHifz: '0', parts: '', annual: '', recitation: '',
    memorization: '', total: '0', grade: '', prize: '0', statusPrize: '', rank: '-',
    teacher: ''
  });

  useEffect(() => {
    setName(student.name);
    setHistory(student.hifzHistory || {});
    setYearData(student.yearData || {
      baseHifz: '0', totalHifz: '0', parts: '', annual: '', recitation: '',
      memorization: '', total: '0', grade: '', prize: '0', statusPrize: '', rank: '-',
      teacher: ''
    });
  }, [student]);

  const baseHifz = calculateBaseHifz(history, currentYearNum);
  const parts = parseFloat(yearData.parts) || 0;
  const totalHifz = Math.min(baseHifz + parts, 30);
  const annual = parseFloat(yearData.annual) || 0;
  const recitation = parseFloat(yearData.recitation) || 0;
  const memorization = parseFloat(yearData.memorization) || 0;
  const totalScore = Math.min(annual + recitation + memorization, 100);
  const { grade, pricePerPart } = calculateGrade(totalScore);
  const prize = calculatePrize(parts, pricePerPart);
  const isActive = parts > 0 || totalScore > 0;
  const isKhatim = totalHifz >= 30;

  const notifyDirty = useCallback((newName: string, newHistory: HifzHistory, newYearData: YearData) => {
    const p = parseFloat(newYearData.parts) || 0;
    const a = parseFloat(newYearData.annual) || 0;
    const r = parseFloat(newYearData.recitation) || 0;
    const m = parseFloat(newYearData.memorization) || 0;
    const ts = Math.min(a + r + m, 100);
    const bh = calculateBaseHifz(newHistory, currentYearNum);
    const th = Math.min(bh + p, 30);
    const { grade: g, pricePerPart: pp } = calculateGrade(ts);
    const pr = calculatePrize(p, pp);

    const updatedYearData: YearData = {
      ...newYearData,
      baseHifz: bh.toString(),
      totalHifz: th.toString(),
      total: ts.toString(),
      grade: g,
      prize: pr.toString(),
    };

    onDirtyChange(student.id, { name: newName, teacher: newYearData.teacher, history: newHistory, yearData: updatedYearData });
  }, [student.id, currentYearNum, onDirtyChange]);

  const updateName = (value: string) => {
    setName(value);
    notifyDirty(value, history, yearData);
  };

  const updateTeacher = (value: string) => {
    const updated = { ...yearData, teacher: value };
    setYearData(updated);
    notifyDirty(name, history, updated);
  };

  const updateYearField = (field: keyof YearData, value: string) => {
    const updated = { ...yearData, [field]: value };
    setYearData(updated);
    notifyDirty(name, history, updated);
  };

  return (
    <tr className="hover:bg-accent/5 transition-colors">
      <td className="border border-border p-1 text-center font-semibold">{index}</td>
      
      <td className="border border-border p-1">
        <Input value={name} onChange={(e) => updateName(e.target.value)} placeholder="الاسم" className="text-center border-0 focus-visible:ring-1" />
      </td>

      <td className="border border-border p-1">
        <Input value={yearData.teacher} onChange={(e) => updateTeacher(e.target.value)} placeholder="المعلمة" className="text-center border-0 focus-visible:ring-1" />
      </td>

      <td className="border border-border p-1 bg-accent/10 text-center font-semibold">
        {baseHifz > 0 ? baseHifz : '-'}
      </td>

      <td className="border border-border p-1 bg-warning/10">
        <Input type="number" value={yearData.parts} onChange={(e) => updateYearField('parts', e.target.value)} placeholder="0" min="0" className="text-center border-0 focus-visible:ring-1 w-20 font-semibold" />
      </td>

      <td className={`border border-border p-1 ${isKhatim ? 'bg-islamic-gold/20' : 'bg-islamic-green/10'}`}>
        {isKhatim ? (
          <span className="text-center font-bold text-islamic-gold block">خاتم ✨</span>
        ) : (
          <Input value={totalHifz} readOnly className="text-center border-0 bg-transparent font-bold text-islamic-green" />
        )}
      </td>

      <td className="border border-border p-1 bg-success/5">
        <Input type="number" value={yearData.annual} onChange={(e) => updateYearField('annual', e.target.value)} placeholder="0" min="0" max="20" className="text-center border-0 focus-visible:ring-1 w-16" />
      </td>

      <td className="border border-border p-1 bg-success/5">
        <Input type="number" value={yearData.recitation} onChange={(e) => updateYearField('recitation', e.target.value)} placeholder="0" min="0" max="20" className="text-center border-0 focus-visible:ring-1 w-16" />
      </td>

      <td className="border border-border p-1 bg-success/5">
        <Input type="number" value={yearData.memorization} onChange={(e) => updateYearField('memorization', e.target.value)} placeholder="0" min="0" max="60" className="text-center border-0 focus-visible:ring-1 w-16" />
      </td>

      <td className="border border-border p-1 bg-success/10">
        <Input value={totalScore} readOnly className="text-center border-0 bg-transparent font-bold" />
      </td>

      <td className={`border border-border p-1 text-center font-semibold ${isActive ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive'}`}>
        {isActive ? 'نشط' : 'منقطع'}
      </td>

      <td className="border border-border p-1 text-center font-semibold">{grade}</td>

      <td className="border border-border p-1 text-center font-semibold text-islamic-green">
        {prize.toLocaleString()}
      </td>

      <td className="border border-border p-1">
        <Input type="number" value={yearData.statusPrize || ''} onChange={(e) => updateYearField('statusPrize', e.target.value)} placeholder="0" min="0" className="text-center border-0 focus-visible:ring-1 w-20 font-semibold" />
      </td>

      <td className="border border-border p-1 text-center font-bold">{yearData.rank}</td>

      <td className="border border-border p-1 text-center">
        <StudentReport student={student} />
      </td>

      <td className="border border-border p-1 text-center">
        <Button variant="destructive" size="sm" onClick={() => onDelete(student.id)} className="h-7 w-7 p-0">
          <Trash2 className="h-4 w-4" />
        </Button>
      </td>
    </tr>
  );
};
