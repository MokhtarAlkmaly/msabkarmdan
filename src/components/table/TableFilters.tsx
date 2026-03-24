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
  return (
    <div className="bg-card rounded-lg border border-border p-4 space-y-4 print:hidden">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-primary font-semibold">
          <Filter className="h-5 w-5" />
          <span>تصفية البيانات</span>
        </div>
        {hasFilters && (
          <Button onClick={onPrintFiltered} variant="secondary" size="sm" className="gap-2">
            <Printer className="h-4 w-4" />
            طباعة النتائج المصفاة
          </Button>
        )}
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="space-y-2">
          <Label className="text-sm font-medium">المعلمة</Label>
          <Select value={selectedTeacher} onValueChange={onTeacherChange}>
            <SelectTrigger className="bg-background">
              <SelectValue placeholder="اختر المعلمة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">عرض الجميع</SelectItem>
              {teachers.map(teacher => (
                <SelectItem key={teacher} value={teacher}>
                  {teacher}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium">اسم الطالبة</Label>
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={nameFilter}
              onChange={(e) => onNameFilterChange(e.target.value)}
              placeholder="ابحث بالاسم..."
              className="pr-10"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium">الحالة</Label>
          <Select value={statusFilter} onValueChange={onStatusFilterChange}>
            <SelectTrigger className="bg-background">
              <SelectValue placeholder="اختر الحالة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="active">نشط</SelectItem>
              <SelectItem value="inactive">منقطع</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium">التقدير</Label>
          <Select value={gradeFilter} onValueChange={onGradeFilterChange}>
            <SelectTrigger className="bg-background">
              <SelectValue placeholder="اختر التقدير" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="ممتاز">ممتاز</SelectItem>
              <SelectItem value="جيد جداً">جيد جداً</SelectItem>
              <SelectItem value="جيد">جيد</SelectItem>
              <SelectItem value="مقبول">مقبول</SelectItem>
              <SelectItem value="ضعيف">ضعيف</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium">الحفظ الجديد (أجزاء)</Label>
          <Input
            type="number"
            value={partsFilter}
            onChange={(e) => onPartsFilterChange(e.target.value)}
            placeholder="الحد الأدنى..."
            min="0"
            className="bg-background"
          />
        </div>
      </div>
    </div>
  );
};
