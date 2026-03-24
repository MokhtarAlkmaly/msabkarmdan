import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Filter, Printer, ChevronDown, ChevronUp } from "lucide-react";

interface Props {
  teachers: string[];
  selectedTeacher: string;
  onTeacherChange: (value: string) => void;
  nameFilter: string;
  onNameFilterChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  gradeFilter: string;
  onGradeFilterChange: (value: string) => void;
  partsFilter: string;
  onPartsFilterChange: (value: string) => void;
  onPrintFiltered: () => void;
  hasFilters: boolean;
}

export const TableFilters = ({
  teachers,
  selectedTeacher,
  onTeacherChange,
  nameFilter,
  onNameFilterChange,
  statusFilter,
  onStatusFilterChange,
  gradeFilter,
  onGradeFilterChange,
  partsFilter,
  onPartsFilterChange,
  onPrintFiltered,
  hasFilters,
}: Props) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="bg-card rounded-lg border border-border print:hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-3 hover:bg-muted/30 transition-colors rounded-lg"
      >
        <div className="flex items-center gap-2 text-primary font-semibold text-sm">
          <Filter className="h-4 w-4" />
          <span>تصفية البيانات</span>
          {hasFilters && <span className="bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded-full">مفعّل</span>}
        </div>
        <div className="flex items-center gap-2">
          {hasFilters && (
            <Button onClick={(e) => { e.stopPropagation(); onPrintFiltered(); }} variant="secondary" size="sm" className="gap-1 text-xs h-7">
              <Printer className="h-3 w-3" />
              طباعة
            </Button>
          )}
          {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {isOpen && (
        <div className="px-3 pb-3 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
          <Select value={selectedTeacher} onValueChange={onTeacherChange}>
            <SelectTrigger className="bg-background h-8 text-xs">
              <SelectValue placeholder="المعلمة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل المعلمات</SelectItem>
              {teachers.map(teacher => (
                <SelectItem key={teacher} value={teacher}>{teacher}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="relative">
            <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input value={nameFilter} onChange={(e) => onNameFilterChange(e.target.value)} placeholder="بحث بالاسم..." className="pr-7 h-8 text-xs" />
          </div>

          <Select value={statusFilter} onValueChange={onStatusFilterChange}>
            <SelectTrigger className="bg-background h-8 text-xs">
              <SelectValue placeholder="الحالة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الحالات</SelectItem>
              <SelectItem value="active">نشط</SelectItem>
              <SelectItem value="inactive">منقطع</SelectItem>
            </SelectContent>
          </Select>

          <Select value={gradeFilter} onValueChange={onGradeFilterChange}>
            <SelectTrigger className="bg-background h-8 text-xs">
              <SelectValue placeholder="التقدير" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل التقديرات</SelectItem>
              <SelectItem value="ممتاز">ممتاز</SelectItem>
              <SelectItem value="جيد جداً">جيد جداً</SelectItem>
              <SelectItem value="جيد">جيد</SelectItem>
              <SelectItem value="مقبول">مقبول</SelectItem>
              <SelectItem value="ضعيف">ضعيف</SelectItem>
            </SelectContent>
          </Select>

          <Input type="number" value={partsFilter} onChange={(e) => onPartsFilterChange(e.target.value)} placeholder="الحد الأدنى للحفظ" min="0" className="bg-background h-8 text-xs" />
        </div>
      )}
    </div>
  );
};
