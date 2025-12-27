interface Props {
  currentYear: string;
}

export const TableHeader = ({ currentYear }: Props) => {
  const currentYearNum = parseInt(currentYear);
  const previousYear = currentYearNum - 1;

  return (
    <thead className="bg-primary text-primary-foreground sticky top-0 z-10">
      <tr>
        <th rowSpan={2} className="border border-border p-2 min-w-[50px]">م</th>
        <th rowSpan={2} className="border border-border p-2 min-w-[150px]">اسم الطالبة</th>
        <th rowSpan={2} className="border border-border p-2 min-w-[120px]">المعلمة</th>
        <th colSpan={6} className="border border-border p-2 bg-accent/20">
          الحفظ في الأعوام السابقة
        </th>
        <th rowSpan={2} className="border border-border p-2 min-w-[80px]">
          حفظ جديد ({currentYear})
        </th>
        <th rowSpan={2} className="border border-border p-2 min-w-[100px]">
          الإجمالي التراكمي (حتى {currentYear})
        </th>
        <th colSpan={4} className="border border-border p-2 bg-success/20">الدرجات</th>
        <th rowSpan={2} className="border border-border p-2 min-w-[70px]">الحالة</th>
        <th rowSpan={2} className="border border-border p-2 min-w-[80px]">التقدير</th>
        <th rowSpan={2} className="border border-border p-2 min-w-[80px]">المكافأة</th>
        <th rowSpan={2} className="border border-border p-2 min-w-[60px]">ترتيب</th>
        <th rowSpan={2} className="border border-border p-2 min-w-[60px]">حذف</th>
      </tr>
      <tr>
        {[1441, 1442, 1443, 1444, 1445, 1446].map(year => (
          <th
            key={year}
            className={`border border-border p-2 min-w-[60px] bg-accent/20 ${
              year >= currentYearNum ? 'opacity-30' : ''
            }`}
          >
            {year}
          </th>
        ))}
        <th className="border border-border p-2 min-w-[70px] bg-success/20">سنة (20)</th>
        <th className="border border-border p-2 min-w-[70px] bg-success/20">تلاوة (20)</th>
        <th className="border border-border p-2 min-w-[70px] bg-success/20">حفظ (60)</th>
        <th className="border border-border p-2 min-w-[70px] bg-success/20">مجموع</th>
      </tr>
    </thead>
  );
};
