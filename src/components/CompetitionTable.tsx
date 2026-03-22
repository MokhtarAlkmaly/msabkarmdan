import { useState, useMemo } from "react";
import { Student } from "@/types/student";
import { TableHeader } from "./table/TableHeader";
import { TableRow } from "./table/TableRow";
import { TableFilters } from "./table/TableFilters";

interface Props {
  students: Student[];
  currentYear: string;
  onUpdate: () => void;
  onDelete: (id: number) => void;
}

export const CompetitionTable = ({ students, currentYear, onUpdate, onDelete }: Props) => {
  const [selectedTeacher, setSelectedTeacher] = useState<string>("all");
  const [nameFilter, setNameFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // استخراج قائمة المعلمات الفريدة
  const teachers = useMemo(() => {
    const uniqueTeachers = Array.from(new Set(students.map(s => s.teacher).filter(Boolean)));
    return uniqueTeachers.sort((a, b) => a.localeCompare(b, 'ar'));
  }, [students]);

  // تطبيق التصفية
  const filteredStudents = useMemo(() => {
    return students.filter(student => {
      // تصفية حسب المعلمة
      if (selectedTeacher !== "all" && student.teacher !== selectedTeacher) {
        return false;
      }

      // تصفية حسب الاسم
      if (nameFilter && !student.name.includes(nameFilter)) {
        return false;
      }

      // تصفية حسب الحالة
      if (statusFilter !== "all") {
        const parts = parseFloat(student.yearData?.parts || '0');
        const total = parseFloat(student.yearData?.total || '0');
        const isActive = parts > 0 || total > 0;
        
        if (statusFilter === "active" && !isActive) return false;
        if (statusFilter === "inactive" && isActive) return false;
      }

      return true;
    });
  }, [students, selectedTeacher, nameFilter, statusFilter]);

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
      />

      <div className="overflow-x-auto rounded-lg border border-border shadow-lg">
        <table className="w-full border-collapse bg-card text-sm">
          <TableHeader currentYear={currentYear} />
          <tbody>
            {filteredStudents.map((student, index) => (
              <TableRow
                key={`${student.id}-${currentYear}`}
                student={student}
                index={index + 1}
                currentYear={currentYear}
                onUpdate={onUpdate}
                onDelete={onDelete}
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
