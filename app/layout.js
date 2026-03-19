import "./globals.css";

export const metadata = {
  title: "California wealth tax calculator | PolicyEngine",
  description:
    "Interactive tool analyzing fiscal impacts of California's proposed billionaire wealth tax under varying assumptions",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
