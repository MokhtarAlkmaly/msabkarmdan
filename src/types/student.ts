// تاريخ الحفظ ديناميكي - يمكن إضافة أي سنة
export interface HifzHistory {
  [key: string]: string; // h1441, h1442, h1443, etc.
}

export interface YearData {
  baseHifz: string;
  totalHifz: string;
  parts: string;
  annual: string;
  recitation: string;
  memorization: string;
  total: string;
  grade: string;
  prize: string;
  statusPrize: string;
  rank: string;
  teacher: string;
}

export interface Student {
  id: number;
  name: string;
  teacher: string;
  hifzHistory?: HifzHistory;
  yearData?: YearData;
}

export const START_YEAR = 1441;
export const END_YEAR = 1450;
