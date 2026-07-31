import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export interface DatabaseClientOptions {
  url: string;
  maxConnections?: number;
}

export function createDatabaseClient(options: DatabaseClientOptions) {
  const queryClient = postgres(options.url, {
    max: options.maxConnections ?? 10
  });

  return {
    db: drizzle(queryClient, { schema }),
    close: () => queryClient.end()
  };
}

export type Database = ReturnType<typeof createDatabaseClient>["db"];

