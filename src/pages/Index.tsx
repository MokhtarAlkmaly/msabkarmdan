import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CompetitionTable } from "@/components/CompetitionTable";
import { ImportExport } from "@/components/ImportExport";
import { NotificationSystem } from "@/components/notifications/NotificationSystem";
import { InstallPrompt } from "@/components/InstallPrompt";
import { Plus, Printer, Trash2, Calendar } from "lucide-react";
import logo from "@/assets/logo.png";
import { Student, START_YEAR, END_YEAR } from "@/types/student";
import {
  loadGlobalStudents,
  saveGlobalStudents,
  getActiveYear,
  setActiveYear,
  loadHifzHistory,
  loadYearData,
  migrateYearData,
} from "@/utils/storage";
import { useToast } from "@/hooks/use-toast";

const Index = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [currentYear, setCurrentYear] = useState<string>(getActiveYear());
  const [studentIdCounter, setStudentIdCounter] = useState(1);
  const { toast } = useToast();

  const loadData = () => {
    const globalStudents = loadGlobalStudents();
    const studentsWithData = globalStudents.map(student => ({
      ...student,
      hifzHistory: loadHifzHistory(student.id),
      yearData: loadYearData(currentYear, student.id),
    }));

    setStudents(studentsWithData);
    
    if (globalStudents.length > 0) {
      const maxId = Math.max(...globalStudents.map(s => s.id));
      setStudentIdCounter(maxId + 1);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentYear]);

  const handleYearChange = (year: string) => {
    // ترحيل بيانات العام السابق للتاريخ
    const globalStudents = loadGlobalStudents();
    migrateYearData(year, globalStudents);
    
    setCurrentYear(year);
    setActiveYear(year);
    toast({
      title: "تم تغيير السنة",
      description: `تم التبديل إلى عام ${year}هـ`,
    });
  };

  const addNewStudent = () => {
    const newStudent = {
      id: studentIdCounter,
      name: '',
      teacher: '',
    };
    
    const allStudents = [...loadGlobalStudents(), newStudent];
    saveGlobalStudents(allStudents);
    setStudentIdCounter(studentIdCounter + 1);
    loadData();
    
    toast({
      title: "تمت الإضافة",
      description: "تم إضافة طالبة جديدة",
    });
  };

  const handleDelete = (id: number) => {
    if (!confirm('هل أنت متأكد من حذف هذه الطالبة؟')) return;

    const allStudents = loadGlobalStudents().filter(s => s.id !== id);
    saveGlobalStudents(allStudents);
    
    // حذف بيانات جميع الأعوام
    for (let year = START_YEAR; year <= END_YEAR; year++) {
      localStorage.removeItem(`quran_db_${year}_${id}`);
    }
    localStorage.removeItem(`hifz_history_${id}`);
    
    loadData();
    toast({
      title: "تم الحذف",
      description: "تم حذف الطالبة بنجاح",
      variant: "destructive",
    });
  };

  const handleReset = () => {
    if (!confirm('هل أنت متأكد من حذف جميع البيانات؟ هذا الإجراء لا يمكن التراجع عنه!')) return;

    localStorage.clear();
    setStudents([]);
    setStudentIdCounter(1);
    
    toast({
      title: "تم الحذف",
      description: "تم حذف جميع البيانات",
      variant: "destructive",
    });
  };

  const handlePrint = () => {
    window.print();
  };

  // حساب الترتيب
  useEffect(() => {
    const sortedStudents = [...students]
      .filter(s => parseFloat(s.yearData?.total || '0') > 0)
      .sort((a, b) => parseFloat(b.yearData?.total || '0') - parseFloat(a.yearData?.total || '0'));

    sortedStudents.forEach((student, index) => {
      if (student.yearData) {
        student.yearData.rank = (index + 1).toString();
        localStorage.setItem(
          `quran_db_${currentYear}_${student.id}`,
          JSON.stringify(student.yearData)
        );
      }
    });
  }, [students, currentYear]);

  const currentDate = new Date().toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Install Prompt */}
      <InstallPrompt />
      
      {/* Header */}
      <header className="bg-primary text-primary-foreground py-6 px-4 print:py-4">
        <div className="container mx-auto">
          <div className="flex flex-col items-center mb-4">
            <img src={logo} alt="مركز إنماء الأهلي الخيري" className="h-24 w-auto mb-4 print:h-20" />
          </div>
          
          <div className="flex justify-between items-start mb-4 print:mb-2">
            <div className="text-sm text-primary-foreground/90">
              <div className="font-bold">مركز إنماء الأهلي الخيري</div>
              <div>الإشراف - شرعب الرونة</div>
            </div>

            <div className="text-center flex-1">
              <h1 className="text-3xl font-bold mb-2 print:text-2xl">بسم الله الرحمن الرحيم</h1>
              <h2 className="text-xl print:text-lg">
                كشف المسابقة الرمضانية للعام {currentYear}هـ
              </h2>
            </div>

            <div className="text-sm text-left text-primary-foreground/90">
              <div>التاريخ:</div>
              <div className="font-semibold">{currentDate}</div>
            </div>
          </div>
        </div>
      </header>

      {/* Controls */}
      <div className="container mx-auto px-4 py-6 print:hidden space-y-4">
        {/* Notifications System */}
        <NotificationSystem students={students} currentYear={currentYear} />

        {/* Import/Export Section */}
        <ImportExport onDataImported={loadData} />

        <div className="bg-card rounded-lg border border-border p-4 space-y-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2 bg-primary/10 px-4 py-2 rounded-md border-2 border-primary">
              <Calendar className="h-5 w-5 text-primary" />
              <span className="font-semibold text-primary">سنة المسابقة:</span>
              <Select value={currentYear} onValueChange={handleYearChange}>
                <SelectTrigger className="w-32 bg-background font-bold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: END_YEAR - START_YEAR + 1 }, (_, i) => START_YEAR + i).map(year => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}هـ
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button onClick={addNewStudent} className="gap-2">
              <Plus className="h-4 w-4" />
              إضافة طالبة جديدة
            </Button>

            <Button onClick={handlePrint} variant="secondary" className="gap-2">
              <Printer className="h-4 w-4" />
              طباعة
            </Button>

            <Button onClick={handleReset} variant="destructive" className="gap-2">
              <Trash2 className="h-4 w-4" />
              حذف جميع البيانات
            </Button>

            <div className="mr-auto text-sm text-muted-foreground">
              عدد الطالبات: <span className="font-bold text-foreground">{students.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="container mx-auto px-4 pb-8">
        <CompetitionTable
          students={students}
          currentYear={currentYear}
          onUpdate={loadData}
          onDelete={handleDelete}
        />
      </div>

      {/* Footer */}
      <footer className="text-center text-sm text-muted-foreground py-4 print:py-2">
        تصميم أ/ مختار الكمالي
      </footer>

      <style>{`
        @media print {
          .print\\:hidden { display: none !important; }
          body { font-size: 11px; }
          @page { size: landscape; margin: 10mm; }
        }
      `}</style>
    </div>
  );
};

export default Index;
