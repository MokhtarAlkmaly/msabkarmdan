import { Student, HifzHistory, YearData } from "@/types/student";

export const loadGlobalStudents = (): Student[] => {
  const stored = localStorage.getItem('globalStudents');
  return stored ? JSON.parse(stored) : [];
};

export const saveGlobalStudents = (students: Student[]) => {
  localStorage.setItem('globalStudents', JSON.stringify(students));
};

export const loadHifzHistory = (studentId: number): HifzHistory => {
  const stored = localStorage.getItem(`hifz_history_${studentId}`);
  return stored ? JSON.parse(stored) : {};
};

export const saveHifzHistory = (studentId: number, history: HifzHistory) => {
  localStorage.setItem(`hifz_history_${studentId}`, JSON.stringify(history));
};

export const loadYearData = (year: string, studentId: number): YearData => {
  const stored = localStorage.getItem(`quran_db_${year}_${studentId}`);
  return stored ? JSON.parse(stored) : {
    baseHifz: '0',
    totalHifz: '0',
    parts: '',
    annual: '',
    recitation: '',
    memorization: '',
    total: '0',
    grade: '',
    prize: '0',
    rank: '-'
  };
};

export const saveYearData = (year: string, studentId: number, data: YearData) => {
  localStorage.setItem(`quran_db_${year}_${studentId}`, JSON.stringify(data));
};

export const getActiveYear = (): string => {
  return localStorage.getItem('active_year') || '1447';
};

export const setActiveYear = (year: string) => {
  localStorage.setItem('active_year', year);
};

// ترحيل بيانات العام السابق للتاريخ عند الانتقال لعام جديد
export const migrateYearData = (newYear: string, students: { id: number }[]) => {
  const newYearNum = parseInt(newYear);
  const previousYear = newYearNum - 1;
  
  students.forEach(student => {
    const history = loadHifzHistory(student.id);
    const previousYearData = loadYearData(previousYear.toString(), student.id);
    
    // إذا كان هناك حفظ جديد في العام السابق، نضيفه للتاريخ
    const previousParts = parseFloat(previousYearData.parts) || 0;
    if (previousParts > 0) {
      const historyKey = `h${previousYear}`;
      history[historyKey] = previousParts.toString();
      saveHifzHistory(student.id, history);
    }
  });
};
