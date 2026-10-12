export function env(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === "") throw new Error(`Missing environment variable: ${name}`);
  return v;
}
export const optEnv = (name: string) => process.env[name] || undefined;

/** Public base URL: APP_URL if set, else Vercel's production domain (set automatically), else localhost. */
export const appUrl = () => {
  const raw = process.env.APP_URL
    || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "")
    || "http://localhost:3000";
  return raw.replace(/\/$/, "");
};
