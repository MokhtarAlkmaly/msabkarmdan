export interface HifzHistory {
  h1441: string;
  h1442: string;
  h1443: string;
  h1444: string;
  h1445: string;
  h1446: string;
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
  rank: string;
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
