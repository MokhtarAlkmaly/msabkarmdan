import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Upload, Download, FileSpreadsheet } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from 'xlsx';
import {
  loadGlobalStudents,
  saveGlobalStudents,
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

  const handleExport = () => {
    const students = loadGlobalStudents();
    
    if (students.length === 0) {
      toast({
        title: "لا توجد بيانات",
        description: "لا توجد بيانات لتصديرها",
        variant: "destructive",
      });
      return;
    }

    // تجهيز البيانات للتصدير
    const exportData = students.map(student => {
      const history = loadHifzHistory(student.id);
      
      // جمع بيانات جميع الأعوام
      const allYearsData: Record<string, any> = {
        'الاسم': student.name,
        'المعلمة': student.teacher,
        'حفظ_1442': history.h1442 || '',
        'حفظ_1443': history.h1443 || '',
        'حفظ_1444': history.h1444 || '',
        'حفظ_1445': history.h1445 || '',
        'حفظ_1446': history.h1446 || '',
      };

      // إضافة بيانات كل عام إن وجدت
      for (let year = 1442; year <= 1450; year++) {
        const yearData = loadYearData(year.toString(), student.id);
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

      return allYearsData;
    });

    // إنشاء ملف Excel
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "بيانات المسابقة");

    // تحسين عرض الأعمدة
    const maxWidth = 20;
    const cols = Object.keys(exportData[0] || {}).map(() => ({ wch: maxWidth }));
    worksheet['!cols'] = cols;

    // تنزيل الملف
    const date = new Date().toISOString().split('T')[0];
    XLSX.writeFile(workbook, `بيانات_المسابقة_${date}.xlsx`);

    toast({
      title: "تم التصدير بنجاح",
      description: `تم تصدير بيانات ${students.length} طالبة`,
    });
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        
        // قراءة أول ورقة
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        if (jsonData.length === 0) {
          toast({
            title: "خطأ",
            description: "الملف فارغ أو لا يحتوي على بيانات صحيحة",
            variant: "destructive",
          });
          return;
        }

        let importedCount = 0;
        let updatedCount = 0;
        const existingStudents = loadGlobalStudents();
        let maxId = existingStudents.length > 0 
          ? Math.max(...existingStudents.map(s => s.id)) 
          : 0;

        jsonData.forEach((row: any) => {
          const name = row['الاسم']?.toString().trim();
          const teacher = row['المعلمة']?.toString().trim();

          if (!name || !teacher) return;

          // البحث عن الطالبة بالاسم والمعلمة
          let student = existingStudents.find(
            s => s.name === name && s.teacher === teacher
          );

          if (!student) {
            // إضافة طالبة جديدة
            maxId++;
            student = { id: maxId, name, teacher };
            existingStudents.push(student);
            importedCount++;
          } else {
            updatedCount++;
          }

          // استيراد بيانات الحفظ التاريخي
          const history = loadHifzHistory(student.id);
          
          if (row['حفظ_1442']) history.h1442 = row['حفظ_1442'].toString();
          if (row['حفظ_1443']) history.h1443 = row['حفظ_1443'].toString();
          if (row['حفظ_1444']) history.h1444 = row['حفظ_1444'].toString();
          if (row['حفظ_1445']) history.h1445 = row['حفظ_1445'].toString();
          if (row['حفظ_1446']) history.h1446 = row['حفظ_1446'].toString();
          
          saveHifzHistory(student.id, history);

          // استيراد بيانات الأعوام
          for (let year = 1442; year <= 1450; year++) {
            const yearStr = year.toString();
            const yearData = loadYearData(yearStr, student.id);
            let hasData = false;

            if (row[`حفظ_جديد_${year}`] !== undefined) {
              yearData.parts = row[`حفظ_جديد_${year}`].toString();
              hasData = true;
            }
            if (row[`سنة_${year}`] !== undefined) {
              yearData.annual = row[`سنة_${year}`].toString();
              hasData = true;
            }
            if (row[`تلاوة_${year}`] !== undefined) {
              yearData.recitation = row[`تلاوة_${year}`].toString();
              hasData = true;
            }
            if (row[`حفظ_درجة_${year}`] !== undefined) {
              yearData.memorization = row[`حفظ_درجة_${year}`].toString();
              hasData = true;
            }

            if (hasData) {
              saveYearData(yearStr, student.id, yearData);
            }
          }
        });

        saveGlobalStudents(existingStudents);
        onDataImported();

        toast({
          title: "تم الاستيراد بنجاح",
          description: `تم استيراد ${importedCount} طالبة جديدة وتحديث ${updatedCount} طالبة`,
        });

      } catch (error) {
        console.error('Error importing file:', error);
        toast({
          title: "خطأ في الاستيراد",
          description: "تأكد من صحة تنسيق ملف Excel",
          variant: "destructive",
        });
      }
    };

    reader.readAsBinaryString(file);
    event.target.value = ''; // إعادة تعيين input
  };

  const downloadTemplate = () => {
    const templateData = [
      {
        'الاسم': 'مثال: فاطمة أحمد',
        'المعلمة': 'مثال: المعلمة نورة',
        'حفظ_1442': '5',
        'حفظ_1443': '10',
        'حفظ_1444': '15',
        'حفظ_1445': '20',
        'حفظ_1446': '25',
        'حفظ_جديد_1447': '5',
        'سنة_1447': '18',
        'تلاوة_1447': '19',
        'حفظ_درجة_1447': '55',
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "قالب البيانات");

    // تحسين عرض الأعمدة
    worksheet['!cols'] = Array(11).fill({ wch: 20 });

    XLSX.writeFile(workbook, 'قالب_استيراد_البيانات.xlsx');

    toast({
      title: "تم تنزيل القالب",
      description: "يمكنك تعبئة البيانات في القالب ثم استيراده",
    });
  };

  return (
    <Card className="p-4 space-y-4 bg-card/50 border-2 border-primary/20">
      <div className="flex items-center gap-2 text-primary font-bold text-lg">
        <FileSpreadsheet className="h-6 w-6" />
        <span>استيراد وتصدير البيانات</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">تنزيل قالب Excel فارغ</p>
          <Button 
            onClick={downloadTemplate} 
            variant="outline"
            className="w-full gap-2"
          >
            <Download className="h-4 w-4" />
            تنزيل القالب
          </Button>
        </div>

        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">استيراد البيانات من Excel</p>
          <Button 
            variant="default"
            className="w-full gap-2 relative overflow-hidden"
          >
            <Upload className="h-4 w-4" />
            <span>استيراد Excel</span>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleImport}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
          </Button>
        </div>

        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">تصدير جميع البيانات</p>
          <Button 
            onClick={handleExport}
            variant="secondary"
            className="w-full gap-2"
          >
            <Download className="h-4 w-4" />
            تصدير إلى Excel
          </Button>
        </div>
      </div>

      <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-2">
        <p className="font-semibold text-foreground">📝 تعليمات الاستيراد:</p>
        <ul className="space-y-1 text-muted-foreground mr-4">
          <li>• نزّل القالب وافتحه في Excel</li>
          <li>• عبّئ البيانات (الاسم والمعلمة إلزامية)</li>
          <li>• احفظ الملف واستورده هنا</li>
          <li>• سيتم دمج البيانات مع البيانات الموجودة</li>
        </ul>
      </div>
    </Card>
  );
};
