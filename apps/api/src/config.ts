import path from "node:path";

export interface AppConfig {
  appOrigin: string;
  cookieName: string;
  databaseFile: string;
  host: string;
  isProduction: boolean;
  port: number;
  sessionTtlDays: number;
  webDistPath: string;
}

export function resolveConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const isProduction = process.env.NODE_ENV === "production";

  return {
    appOrigin: overrides.appOrigin ?? process.env.APP_ORIGIN ?? "http://localhost:4173",
    cookieName: overrides.cookieName ?? process.env.SESSION_COOKIE_NAME ?? "bambuview_session",
    databaseFile:
      overrides.databaseFile ??
      process.env.DATABASE_FILE ??
      path.resolve(process.cwd(), "apps/api/data/bambuview.db"),
    host: overrides.host ?? process.env.HOST ?? "0.0.0.0",
    isProduction,
    port: overrides.port ?? Number(process.env.PORT ?? "4173"),
    sessionTtlDays: overrides.sessionTtlDays ?? 30,
    webDistPath:
      overrides.webDistPath ?? path.resolve(process.cwd(), "apps/web/dist")
  };
}
