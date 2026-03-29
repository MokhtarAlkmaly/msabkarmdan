import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Upload, Download, FileSpreadsheet, ChevronDown, ChevronUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from 'xlsx';
import {
  loadGlobalStudents,
  saveStudent,
  loadHifzHistory,
  saveHifzHistory,
  loadYearData,
  saveYearData,
} from "@/utils/storage";
import { Student } from "@/types/student";

interface Props {
  onDataImported: () => void;
}

export const ImportExport = ({ onDataImported }: Props) => {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);

  const handleExport = async () => {
    const students = await loadGlobalStudents();
    
    if (students.length === 0) {
      toast({ title: "لا توجد بيانات", description: "لا توجد بيانات لتصديرها", variant: "destructive" });
      return;
    }

    const exportData = [];
    for (const student of students) {
      const history = await loadHifzHistory(student.id);
      const allYearsData: Record<string, any> = {
        'الاسم': student.name,
        'حفظ_1441': history.h1441 || '',
        'حفظ_1442': history.h1442 || '',
        'حفظ_1443': history.h1443 || '',
        'حفظ_1444': history.h1444 || '',
        'حفظ_1445': history.h1445 || '',
        'حفظ_1446': history.h1446 || '',
      };

      for (let year = 1442; year <= 1450; year++) {
        const yearData = await loadYearData(year.toString(), student.id);
        if (yearData.parts || yearData.total !== '0') {
          allYearsData[`حفظ_جديد_${year}`] = yearData.parts || '';
          allYearsData[`سنة_${year}`] = yearData.annual || '';
          allYearsData[`تلاوة_${year}`] = yearData.recitation || '';
          allYearsData[`حفظ_درجة_${year}`] = yearData.memorization || '';
          allYearsData[`مجموع_${year}`] = yearData.total || '';
          allYearsData[`تقدير_${year}`] = yearData.grade || '';
          allYearsData[`مكافأة_${year}`] = yearData.prize || '';
        }
      }
      exportData.push(allYearsData);
    }

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "بيانات المسابقة");
    const cols = Object.keys(exportData[0] || {}).map(() => ({ wch: 20 }));
    worksheet['!cols'] = cols;
    const date = new Date().toISOString().split('T')[0];
    XLSX.writeFile(workbook, `بيانات_المسابقة_${date}.xlsx`);
    toast({ title: "تم التصدير بنجاح", description: `تم تصدير بيانات ${students.length} طالبة` });
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        if (jsonData.length === 0) {
          toast({ title: "خطأ", description: "الملف فارغ أو لا يحتوي على بيانات صحيحة", variant: "destructive" });
          return;
        }

        let importedCount = 0;
        let updatedCount = 0;
        const existingStudents = await loadGlobalStudents();

        for (const row of jsonData as any[]) {
          const name = row['الاسم']?.toString().trim();
          if (!name) continue;

          let student = existingStudents.find(s => s.name === name);
          let studentId: number;

          if (!student) {
            const newId = await saveStudent({ name, teacher: '' });
            if (!newId) continue;
            studentId = newId;
            importedCount++;
          } else {
            studentId = student.id;
            updatedCount++;
          }

          const history = await loadHifzHistory(studentId);
          if (row['حفظ_1441']) history.h1441 = row['حفظ_1441'].toString();
          if (row['حفظ_1442']) history.h1442 = row['حفظ_1442'].toString();
          if (row['حفظ_1443']) history.h1443 = row['حفظ_1443'].toString();
          if (row['حفظ_1444']) history.h1444 = row['حفظ_1444'].toString();
          if (row['حفظ_1445']) history.h1445 = row['حفظ_1445'].toString();
          if (row['حفظ_1446']) history.h1446 = row['حفظ_1446'].toString();
          await saveHifzHistory(studentId, history);

          for (let year = 1442; year <= 1450; year++) {
            let hasData = false;
            const yearData = await loadYearData(year.toString(), studentId);
            if (row[`حفظ_جديد_${year}`] !== undefined) { yearData.parts = row[`حفظ_جديد_${year}`].toString(); hasData = true; }
            if (row[`سنة_${year}`] !== undefined) { yearData.annual = row[`سنة_${year}`].toString(); hasData = true; }
            if (row[`تلاوة_${year}`] !== undefined) { yearData.recitation = row[`تلاوة_${year}`].toString(); hasData = true; }
            if (row[`حفظ_درجة_${year}`] !== undefined) { yearData.memorization = row[`حفظ_درجة_${year}`].toString(); hasData = true; }
            if (hasData) await saveYearData(year.toString(), studentId, yearData);
          }
        }

        onDataImported();
        toast({ title: "تم الاستيراد بنجاح", description: `تم استيراد ${importedCount} طالبة جديدة وتحديث ${updatedCount} طالبة` });
      } catch (error) {
        console.error('Error importing file:', error);
        toast({ title: "خطأ في الاستيراد", description: "تأكد من صحة تنسيق ملف Excel", variant: "destructive" });
      }
    };
    reader.readAsBinaryString(file);
    event.target.value = '';
  };

  const downloadTemplate = () => {
    const templateData = [{
      'الاسم': 'مثال: فاطمة أحمد',
      'حفظ_1441': '3', 'حفظ_1442': '5', 'حفظ_1443': '10',
      'حفظ_1444': '15', 'حفظ_1445': '20', 'حفظ_1446': '25',
      'حفظ_جديد_1447': '5', 'سنة_1447': '18', 'تلاوة_1447': '19', 'حفظ_درجة_1447': '55',
    }];
    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "قالب البيانات");
    worksheet['!cols'] = Array(11).fill({ wch: 20 });
    XLSX.writeFile(workbook, 'قالب_استيراد_البيانات.xlsx');
    toast({ title: "تم تنزيل القالب", description: "يمكنك تعبئة البيانات في القالب ثم استيراده" });
  };

  return (
    <Card className="bg-card/50 border border-primary/20 print:hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-3 hover:bg-muted/30 transition-colors rounded-lg"
      >
        <div className="flex items-center gap-2 text-primary font-semibold text-sm">
          <FileSpreadsheet className="h-4 w-4" />
          <span>استيراد وتصدير البيانات</span>
        </div>
        {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {isOpen && (
        <div className="px-3 pb-3 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <Button onClick={downloadTemplate} variant="outline" size="sm" className="gap-1 text-xs">
              <Download className="h-3 w-3" />
              تنزيل القالب
            </Button>
            <Button variant="default" size="sm" className="gap-1 text-xs relative overflow-hidden">
              <Upload className="h-3 w-3" />
              <span>استيراد</span>
              <input type="file" accept=".xlsx,.xls" onChange={handleImport} className="absolute inset-0 opacity-0 cursor-pointer" />
            </Button>
            <Button onClick={handleExport} variant="secondary" size="sm" className="gap-1 text-xs">
              <Download className="h-3 w-3" />
              تصدير
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">📝 نزّل القالب، عبّئ البيانات (الاسم إلزامي)، ثم استورده.</p>
        </div>
      )}
    </Card>
  );
};
