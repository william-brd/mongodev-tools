import { DataSource, type DataSourceOptions } from "typeorm";
import { ScriptEntity } from "./entities/script.entity";
import { ExecutionEntity } from "./entities/execution.entity";
import { isDebug } from "./logger";

// Docker env_file preserves inline comments verbatim: VALUE=foo  # comment
// This strips the comment and trims whitespace before use.
const env = (key: string): string | undefined =>
  process.env[key]?.split("#")[0].trim() || undefined;

function buildOptions(): DataSourceOptions {
  const vendor = (env("DATABASE_VENDOR") || "postgresql").toLowerCase();
  const schema = env("DATABASE_SCHEMA") || "mongo_tools";
  const entities = [ScriptEntity, ExecutionEntity];
  const synchronize = false;
  const logging = isDebug ? (["error", "warn", "schema", "query"] as const) : false;

  if (vendor === "postgresql" || vendor === "postgres") {
    if (env("DATABASE_URL")) {
      const url = env("DATABASE_URL")!.replace(/^["']|["']$/g, "");
      return { type: "postgres", url, schema, entities, synchronize, logging };
    }
    return {
      type: "postgres",
      host: env("DATABASE_HOST")!,
      port: parseInt(env("DATABASE_PORT") || "5432"),
      username: env("DATABASE_USER")!,
      password: env("DATABASE_PASSWORD")!,
      database: env("DATABASE_NAME")!,
      schema,
      entities,
      synchronize,
      logging,
    };
  }

  if (vendor === "mssql") {
    return {
      type: "mssql",
      host: env("DATABASE_HOST")!,
      port: parseInt(env("DATABASE_PORT") || "1433"),
      username: env("DATABASE_USER")!,
      password: env("DATABASE_PASSWORD")!,
      database: env("DATABASE_NAME")!,
      schema,
      entities,
      synchronize,
      logging,
      options: {
        encrypt: env("DATABASE_ENCRYPT") !== "false",
        trustServerCertificate: env("DATABASE_TRUST_CERT") === "true",
      },
    };
  }

  if (vendor === "oracle") {
    const host = env("DATABASE_HOST")!;
    const port = env("DATABASE_PORT") || "1521";
    const target = env("DATABASE_SERVICE_NAME") || env("DATABASE_SID");
    if (!target) throw new Error("Oracle requer DATABASE_SERVICE_NAME ou DATABASE_SID no .env");

    return {
      type: "oracle",
      connectString: `${host}:${port}/${target}`,
      username: env("DATABASE_USER")!,
      password: env("DATABASE_PASSWORD")!,
      schema,
      entities,
      synchronize,
      logging,
    } as DataSourceOptions;
  }

  throw new Error(`DATABASE_VENDOR inválido: "${vendor}". Use postgresql, mssql ou oracle.`);
}

export const AppDataSource = new DataSource(buildOptions());
