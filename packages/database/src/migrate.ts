import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import postgres from "postgres";
import { loadEnvFromNearestFile, parseEnv } from "@knowledgeos/shared";

loadEnvFromNearestFile();
const env = parseEnv(process.env);
const sql = postgres(env.DATABASE_URL, {
  max: 1
});

const currentDir = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(currentDir, "..", "drizzle");

try {
  await sql`
    create table if not exists schema_migrations (
      id text primary key,
      applied_at timestamptz not null default now()
    )
  `;

  const files = (await readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();

  for (const file of files) {
    const [applied] = await sql<{ id: string }[]>`
      select id from schema_migrations where id = ${file} limit 1
    `;

    if (applied) {
      console.log(JSON.stringify({ level: "info", message: "Migration already applied", migration: file }));
      continue;
    }

    const content = await readFile(join(migrationsDir, file), "utf8");
    await sql.begin(async (transaction) => {
      await transaction.unsafe(content);
      await transaction`
        insert into schema_migrations (id) values (${file})
      `;
    });

    console.log(JSON.stringify({ level: "info", message: "Migration applied", migration: file }));
  }
} finally {
  await sql.end();
}
