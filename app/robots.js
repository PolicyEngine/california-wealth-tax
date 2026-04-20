export default function robots() {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
      },
    ],
    sitemap: "https://policyengine.org/us/california-wealth-tax/sitemap.xml",
  };
}
