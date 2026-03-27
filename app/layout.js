import "./globals.css";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"] });
const basePath =
  process.env.NEXT_PUBLIC_BASE_PATH !== undefined
    ? process.env.NEXT_PUBLIC_BASE_PATH
    : "/us/california-wealth-tax/embed";

export const metadata = {
  title: "California wealth tax calculator | PolicyEngine",
  description:
    "Interactive tool analyzing fiscal impacts of California's proposed billionaire wealth tax under varying assumptions",
  icons: { icon: `${basePath}/favicon.svg` },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
