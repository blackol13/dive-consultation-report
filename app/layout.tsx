import type { Metadata } from "next";
import "./globals.css";
export const metadata:Metadata={title:"DIVE 상담 리포트",description:"RTP 결과와 상담 내용을 맞춤형 성장 리포트로 만드는 다이브 내부 서비스"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ko"><body>{children}</body></html>}
