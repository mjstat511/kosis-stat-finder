// 임시(가짜) 데이터: 서버를 연결하기 전에 화면 모양만 확인하려고 만든 파일이다.
// 서버 연결 작업 때 이 파일은 지운다.

import type { Answer, Candidate, Clarify } from "./types";

export const KOSIS_HOME = "https://kosis.kr";

export const mockCandidates: Candidate[] = [
  {
    tblId: "DT_1YL20531E",
    tblName: "청년실업률(시도)",
    reason: "질문의 '청년 실업률'과 통계표 이름이 같습니다.",
    period: "1999~2026",
  },
  {
    tblId: "MOCK_2",
    tblName: "연령별 실업률",
    reason: "연령 구간별 실업률을 함께 볼 수 있습니다.",
    period: "2000~2026",
  },
  {
    tblId: "MOCK_3",
    tblName: "경제활동인구 총괄",
    reason: "실업률의 바탕이 되는 인구 통계입니다.",
    period: "1980~2026",
  },
];

export const mockAnswer: Answer = {
  sentences: [
    "2026년 2분기 청년실업률은 7.2%입니다.",
    "1년 전(2025년 2분기)의 6.5%보다 0.7%p 높습니다.",
  ],
  calculation: "2026년 2분기 7.2% − 2025년 2분기 6.5% = 0.7%p",
  sourceName: "청년실업률(시도)",
  period: "2025년 2분기~2026년 2분기",
  kosisUrl:
    "https://kosis.kr/statHtml/statHtml.do?orgId=101&tblId=DT_1YL20531E",
};

export const mockClarify: Clarify = {
  message: "어떤 물가를 말씀하시나요?",
  options: ["소비자물가", "생산자물가", "수출입물가"],
};

export const mockAltKeywords = ["실업률", "고용률", "경제활동인구"];
