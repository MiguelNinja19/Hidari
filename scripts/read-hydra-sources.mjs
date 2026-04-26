import { ClassicLevel } from "classic-level";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

const defaultHydraDbPath = path.join(
  os.homedir(),
  "AppData",
  "Roaming",
  "hydralauncher",
  "hydra-db"
);

const sourceDbPath = process.argv[2] || defaultHydraDbPath;
const snapshotPath =
  process.argv[3] || path.join(process.cwd(), ".tmp-hydra-db-snapshot");

async function ensureCleanSnapshot(targetPath) {
  await fs.rm(targetPath, { recursive: true, force: true });
  await fs.mkdir(targetPath, { recursive: true });
}

async function copyDbSnapshot(fromPath, toPath) {
  const entries = await fs.readdir(fromPath);
  const allowed = entries.filter((name) => {
    if (name === "LOCK") return false;
    return (
      name === "CURRENT" ||
      name.startsWith("MANIFEST-") ||
      name.endsWith(".ldb") ||
      name.endsWith(".log")
    );
  });

  for (const name of allowed) {
    await fs.copyFile(path.join(fromPath, name), path.join(toPath, name));
  }
}

async function readDownloadSources(dbPath) {
  const db = new ClassicLevel(dbPath, { valueEncoding: "json" });
  await db.open();
  const sub = db.sublevel("downloadSources", { valueEncoding: "json" });
  await sub.open();

  const values = [];
  for await (const [id, value] of sub.iterator()) {
    values.push({ id, ...value });
  }

  await db.close();
  return values;
}

async function main() {
  await ensureCleanSnapshot(snapshotPath);
  await copyDbSnapshot(sourceDbPath, snapshotPath);
  const values = await readDownloadSources(snapshotPath);

  console.log(
    JSON.stringify(
      {
        sourceDbPath,
        snapshotPath,
        count: values.length,
        values,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error("Falha ao ler downloadSources:", error);
  process.exitCode = 1;
});

