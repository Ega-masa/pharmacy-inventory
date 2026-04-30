import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "薬局在庫分析システム",
  description: "薬局の在庫最適化を支援する分析ツール",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>
        <div className="min-h-screen bg-gray-50">{children}</div>
      </body>
    </html>
  );
}
