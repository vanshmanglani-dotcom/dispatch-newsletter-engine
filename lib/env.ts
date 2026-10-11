export function env(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === "") throw new Error(`Missing environment variable: ${name}`);
  return v;
}
export const optEnv = (name: string) => process.env[name] || undefined;
export const appUrl = () => (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
