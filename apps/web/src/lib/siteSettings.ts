// Google Analytics removed 2026-11-24: stats come from Cloudflare (C:/code/site-stats).
const googleAnalyticsMeasurementId = String(import.meta.env.PUBLIC_GA_MEASUREMENT_ID ?? "").trim();

export const siteSettings = {
  siteName: "Confessions Hub",
  issueReportUrl: "https://github.com/abereanone/confession/issues/new",
  analytics: {
    googleAnalyticsMeasurementId,
    enabled: googleAnalyticsMeasurementId.length > 0,
  },
} as const;
