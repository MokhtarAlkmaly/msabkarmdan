import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, Filter } from "lucide-react";

interface Props {
  teachers: string[];
  selectedTeacher: string;
  onTeacherChange: (value: string) => void;
  nameFilter: string;
  onNameFilterChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
}

export const TableFilters = ({
  teachers,
  selectedTeacher,
  onTeacherChange,
  nameFilter,
  onNameFilterChange,
  statusFilter,
  onStatusFilterChange,
}: Props) => {
  return (
    <div className="bg-card rounded-lg border border-border p-4 space-y-4">
      <div className="flex items-center gap-2 text-primary font-semibold">
        <Filter className="h-5 w-5" />
        <span>تصفية البيانات</span>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
      </div>
    </div>
  );
};
