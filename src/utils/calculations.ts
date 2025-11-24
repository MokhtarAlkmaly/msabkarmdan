import { HifzHistory } from "@/types/student";

// الحساب الصحيح: يأخذ فقط الأعوام قبل العام الحالي
export const calculateBaseHifz = (history: HifzHistory, currentYear: number): number => {
  const yearValues: Record<number, number> = {
    1442: parseFloat(history.h1442) || 0,
    1443: parseFloat(history.h1443) || 0,
    1444: parseFloat(history.h1444) || 0,
    1445: parseFloat(history.h1445) || 0,
    1446: parseFloat(history.h1446) || 0,
  };

  let baseHifz = 0;
  
  // نأخذ فقط الأعوام التي تسبق العام الحالي
  for (let year = 1442; year < currentYear; year++) {
    const value = yearValues[year] || 0;
    if (value > baseHifz) {
      baseHifz = value;
    }
  }

  return baseHifz;
};

export const calculateGrade = (totalScore: number): { grade: string; pricePerPart: number } => {
  if (totalScore >= 90) return { grade: "ممتاز", pricePerPart: 2000 };
  if (totalScore >= 80) return { grade: "جيد جداً", pricePerPart: 1500 };
  if (totalScore >= 70) return { grade: "جيد", pricePerPart: 1000 };
  if (totalScore >= 60) return { grade: "مقبول", pricePerPart: 500 };
  if (totalScore > 0) return { grade: "ضعيف", pricePerPart: 0 };
  return { grade: "", pricePerPart: 0 };
};

export const calculatePrize = (parts: number, pricePerPart: number): number => {
  return parts >= 1 ? parts * pricePerPart : 0;
};
