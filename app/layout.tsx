import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "통계표 찾기",
  description: "별처럼 흩어진 KOSIS 통계표에서 답을 찾아 드려요",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* 배경 장식: 먼 별, 가까운 별, 별똥별 (읽기 전용 장식이라 스크린리더가 읽지 않는다) */}
        <div className="stars-far" aria-hidden="true" />
        <div className="stars-near" aria-hidden="true" />
        <div className="shooting-star" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}
