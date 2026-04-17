import "./globals.css";
import { Inter } from "next/font/google";
import Script from "next/script";

const inter = Inter({ subsets: ["latin"] });
const basePath =
  process.env.NEXT_PUBLIC_BASE_PATH !== undefined
    ? process.env.NEXT_PUBLIC_BASE_PATH
    : "/us/california-wealth-tax/embed";

const GA_ID = "G-91M4529HE7";
const TOOL_NAME = "california-wealth-tax";

export const metadata = {
  title: "California wealth tax calculator | PolicyEngine",
  description:
    "Interactive tool analyzing fiscal impacts of California's proposed billionaire wealth tax under varying assumptions",
  icons: { icon: `${basePath}/favicon.svg` },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
          strategy="afterInteractive"
        />
        <Script id="gtag-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_ID}', { tool_name: '${TOOL_NAME}' });
          `}
        </Script>
      </head>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
