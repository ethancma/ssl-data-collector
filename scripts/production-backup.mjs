import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { spawn } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";
import { createClient } from "@supabase/supabase-js";

const SCHEMAS = "auth,core,storage,supabase_migrations,public";
const PAGE_SIZE = 100;
const RETAINED_BACKUPS = 2;

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function redact(value, secrets) {
  return secrets.reduce(
    (result, secret) => result.replaceAll(secret, "[REDACTED]"),
    value,
  );
}

function run(command, args, secrets) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => {
      stdout = (stdout + chunk).slice(-64_000);
    });
    child.stderr.setEncoding("utf8").on("data", (chunk) => {
      stderr = (stderr + chunk).slice(-64_000);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }
      const details = redact(stderr || stdout, secrets);
      reject(new Error(`${command} exited with code ${code}.${details ? `\n${details}` : ""}`));
    });
  });
}

async function sha256File(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

export function objectPath(root, storagePath) {
  if (
    !storagePath ||
    storagePath.startsWith("/") ||
    storagePath.split("/").some((part) => part === "." || part === "..")
  ) {
    throw new Error("Unsafe Storage object path encountered.");
  }
  const resolvedRoot = path.resolve(root);
  const resolvedPath = path.resolve(resolvedRoot, storagePath);
  if (!resolvedPath.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error("Storage object path escapes backup directory.");
  }
  return resolvedPath;
}

export function inventorySignature(items) {
  return JSON.stringify(
    items.map(({ name, updated_at, metadata }) => ({
      name,
      updated_at: updated_at ?? null,
      size: metadata?.size ?? null,
      mimetype: metadata?.mimetype ?? null,
      etag: metadata?.eTag ?? metadata?.etag ?? null,
    })),
  );
}

export function backupsToPrune(contents, currentKey) {
  const backups = contents
    .filter(
      (item) =>
        (item.Key?.startsWith("weekly/") || item.Key?.startsWith("manual/")) &&
        item.Key.endsWith(".tar.gz.age") &&
        item.Key !== currentKey,
    )
    .sort(
      (left, right) =>
        Date.parse(right.LastModified) - Date.parse(left.LastModified) ||
        right.Key.localeCompare(left.Key),
    );
  return backups.slice(RETAINED_BACKUPS - 1);
}

async function listStorageObjects(storage, prefix = "") {
  const items = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await storage
      .from("attachments")
      .list(prefix, {
        limit: PAGE_SIZE,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
    if (error) throw new Error(`Could not list attachments Storage: ${error.message}`);

    for (const item of data ?? []) {
      const name = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null && item.metadata === null) {
        items.push(...(await listStorageObjects(storage, name)));
      } else {
        items.push({ ...item, name });
      }
    }

    if ((data?.length ?? 0) < PAGE_SIZE) break;
  }
  return items.sort((left, right) => left.name.localeCompare(right.name));
}

async function readAttachments(client) {
  const { rows } = await client.query(`
    select id, parent_table, parent_id, storage_path, uploaded_by, uploaded_at
    from core.attachments
    order by id
  `);
  return rows.map((row) => ({
    id: Number(row.id),
    parent_table: row.parent_table,
    parent_id: Number(row.parent_id),
    storage_path: row.storage_path,
    uploaded_by: Number(row.uploaded_by),
    uploaded_at: row.uploaded_at,
  }));
}

async function copyStorageObjects(storage, inventory, destination) {
  const records = [];
  for (const item of inventory) {
    const { data, error } = await storage.from("attachments").download(item.name);
    if (error) {
      throw new Error(`Could not download an attachment Storage object: ${error.message}`);
    }

    const outputPath = objectPath(destination, item.name);
    await mkdir(path.dirname(outputPath), { recursive: true, mode: 0o700 });
    await writeFile(outputPath, Buffer.from(await data.arrayBuffer()), { mode: 0o600 });
    const fileStat = await stat(outputPath);
    records.push({
      path: item.name,
      size: fileStat.size,
      sha256: await sha256File(outputPath),
    });
  }
  return records;
}

async function listFiles(directory, relativeTo = directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(fullPath, relativeTo)));
    else if (entry.isFile()) files.push(path.relative(relativeTo, fullPath));
  }
  return files.sort();
}

async function createDatabaseDumps(workspace, dbUrl, secrets) {
  const dumpDirectory = path.join(workspace, "database");
  await mkdir(dumpDirectory, { mode: 0o700 });
  const common = ["supabase", "db", "dump", "--db-url", dbUrl];
  await run("npx", ["--no-install", ...common, "--role-only", "--file", path.join(dumpDirectory, "roles.sql")], secrets);
  await run("npx", ["--no-install", ...common, "--schema", SCHEMAS, "--file", path.join(dumpDirectory, "schema.sql")], secrets);
  await run(
    "npx",
    [
      "--no-install",
      ...common,
      "--schema",
      SCHEMAS,
      "--data-only",
      "--file",
      path.join(dumpDirectory, "data.sql"),
    ],
    secrets,
  );

  const dumps = {};
  for (const filename of await listFiles(dumpDirectory)) {
    const fullPath = path.join(dumpDirectory, filename);
    dumps[filename] = {
      size: (await stat(fullPath)).size,
      sha256: await sha256File(fullPath),
    };
  }
  return dumps;
}

async function uploadAndPrune(encryptedFile, manifest, config, secrets) {
  const archiveStat = await stat(encryptedFile);
  const key = `${config.kind}/${config.date}/${config.runId}.tar.gz.age`;
  const endpoint = `https://${config.accountId}.r2.cloudflarestorage.com`;
  const destination = `s3://${config.bucket}/${key}`;
  await run(
    "aws",
    [
      "s3",
      "cp",
      encryptedFile,
      destination,
      "--endpoint-url",
      endpoint,
      "--only-show-errors",
      "--metadata",
      `sha256=${manifest.encryptedSha256}`,
    ],
    secrets,
  );

  const head = JSON.parse(
    await run(
      "aws",
      [
        "s3api",
        "head-object",
        "--bucket",
        config.bucket,
        "--key",
        key,
        "--endpoint-url",
        endpoint,
        "--output",
        "json",
      ],
      secrets,
    ),
  );
  if (
    Number(head.ContentLength) !== archiveStat.size ||
    head.Metadata?.sha256 !== manifest.encryptedSha256
  ) {
    throw new Error("R2 backup verification failed; older backups were not pruned.");
  }
  const verifiedCopy = `${encryptedFile}.verified-copy`;
  try {
    await run(
      "aws",
      [
        "s3",
        "cp",
        destination,
        verifiedCopy,
        "--endpoint-url",
        endpoint,
        "--only-show-errors",
      ],
      secrets,
    );
    if ((await sha256File(verifiedCopy)) !== manifest.encryptedSha256) {
      throw new Error("R2 downloaded backup hash does not match; older backups were not pruned.");
    }
  } finally {
    await rm(verifiedCopy, { force: true });
  }

  const listed = JSON.parse(
    await run(
      "aws",
      [
        "s3api",
        "list-objects-v2",
        "--bucket",
        config.bucket,
        "--prefix",
        "",
        "--endpoint-url",
        endpoint,
        "--output",
        "json",
      ],
      secrets,
    ),
  );
  if (!(listed.Contents ?? []).some((item) => item.Key === key)) {
    throw new Error("New backup is not visible in R2; older backups were not pruned.");
  }
  for (const oldBackup of backupsToPrune(listed.Contents ?? [], key)) {
    await run(
      "aws",
      [
        "s3api",
        "delete-object",
        "--bucket",
        config.bucket,
        "--key",
        oldBackup.Key,
        "--endpoint-url",
        endpoint,
        "--output",
        "json",
      ],
      secrets,
    );
  }
}

async function main() {
  const expectedProjectRef = requiredEnv("EXPECTED_SUPABASE_PROJECT_REF");
  const projectRef = requiredEnv("SUPABASE_PROJECT_REF");
  if (projectRef !== expectedProjectRef) {
    throw new Error("Configured Supabase project does not match the expected backup target.");
  }
  const dbUrl = requiredEnv("SUPABASE_DB_URL");
  const dbEndpoint = new URL(dbUrl);
  if (!["postgres:", "postgresql:"].includes(dbEndpoint.protocol)) {
    throw new Error("Database URL must use the PostgreSQL protocol.");
  }
  const directEndpoint = dbEndpoint.hostname === `db.${projectRef}.supabase.co`;
  const sessionPoolerEndpoint =
    dbEndpoint.hostname.endsWith(".pooler.supabase.com") &&
    decodeURIComponent(dbEndpoint.username) === `postgres.${projectRef}` &&
    dbEndpoint.port === "5432";
  if (!directEndpoint && !sessionPoolerEndpoint) {
    throw new Error(
      "Database URL must use the expected project's direct endpoint or session pooler.",
    );
  }

  const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const url = new URL(supabaseUrl);
  if (
    url.protocol !== "https:" ||
    url.hostname !== `${projectRef}.supabase.co` ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  ) {
    throw new Error("Supabase URL must be the HTTPS origin for the expected project.");
  }

  const kind = requiredEnv("BACKUP_KIND");
  if (!["manual", "weekly"].includes(kind)) {
    throw new Error("BACKUP_KIND must be 'manual' or 'weekly'.");
  }
  const recipient = requiredEnv("AGE_RECIPIENT");
  if (!recipient.startsWith("age1")) throw new Error("AGE_RECIPIENT is not an age public recipient.");

  const accountId = requiredEnv("R2_ACCOUNT_ID");
  const bucket = requiredEnv("R2_BUCKET");
  if (!/^[a-f0-9]{32}$/.test(accountId)) {
    throw new Error("R2_ACCOUNT_ID must be a 32-character Cloudflare account ID.");
  }
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) {
    throw new Error("R2_BUCKET must be a valid bucket name.");
  }
  requiredEnv("R2_ACCESS_KEY_ID");
  requiredEnv("R2_SECRET_ACCESS_KEY");
  const runId = requiredEnv("GITHUB_RUN_ID");
  const attempt = requiredEnv("GITHUB_RUN_ATTEMPT");
  const timestamp = new Date();
  const config = {
    kind,
    accountId,
    bucket,
    date: timestamp.toISOString().slice(0, 10),
    runId: `${runId}-${attempt}`,
  };
  const secrets = [
    process.env.SUPABASE_DB_URL,
    process.env.SUPABASE_SECRET_KEY,
    process.env.R2_SECRET_ACCESS_KEY,
    process.env.R2_ACCESS_KEY_ID,
  ].filter(Boolean);
  const workspace = await mkdtemp(path.join(os.tmpdir(), "ssl-data-backup-"));
  const archivePath = `${workspace}.tar.gz`;
  const encryptedPath = `${archivePath}.age`;

  try {
    const supabase = createClient(supabaseUrl, requiredEnv("SUPABASE_SECRET_KEY"), {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const db = new pg.Client({
      connectionString: dbUrl,
      ssl: { rejectUnauthorized: true },
      connectionTimeoutMillis: 15_000,
    });
    await db.connect();

    try {
      const attachmentsBefore = await readAttachments(db);
      const inventoryBefore = await listStorageObjects(supabase.storage);
      const buckets = await supabase.storage.listBuckets();
      if (buckets.error) {
        throw new Error(`Could not read Storage bucket metadata: ${buckets.error.message}`);
      }
      const attachmentBucket = buckets.data?.find((item) => item.id === "attachments");
      if (!attachmentBucket || attachmentBucket.public) {
        throw new Error("The private attachments bucket is missing or unexpectedly public.");
      }

      const databaseDumps = await createDatabaseDumps(workspace, dbUrl, secrets);
      const attachmentDirectory = path.join(workspace, "attachments");
      await mkdir(attachmentDirectory, { mode: 0o700 });
      const objectRecords = await copyStorageObjects(
        supabase.storage,
        inventoryBefore,
        attachmentDirectory,
      );

      const [attachmentsAfter, inventoryAfter] = await Promise.all([
        readAttachments(db),
        listStorageObjects(supabase.storage),
      ]);
      if (JSON.stringify(attachmentsBefore) !== JSON.stringify(attachmentsAfter)) {
        throw new Error("Attachment metadata changed during backup; refusing to publish an inconsistent snapshot.");
      }
      if (inventorySignature(inventoryBefore) !== inventorySignature(inventoryAfter)) {
        throw new Error("Storage objects changed during backup; refusing to publish an inconsistent snapshot.");
      }

      const objectPaths = new Set(objectRecords.map((record) => record.path));
      const missingObjects = attachmentsAfter
        .map((attachment) => attachment.storage_path)
        .filter((storagePath) => !objectPaths.has(storagePath));
      if (missingObjects.length > 0) {
        throw new Error(
          `${missingObjects.length} attachment row(s) reference missing Storage objects; refusing to publish backup.`,
        );
      }

      const attachedPaths = new Set(attachmentsAfter.map((row) => row.storage_path));
      const manifest = {
        formatVersion: 1,
        createdAt: new Date().toISOString(),
        projectRef,
        schemas: SCHEMAS.split(","),
        storageBucket: attachmentBucket,
        databaseDumps,
        attachmentCount: attachmentsAfter.length,
        objectCount: objectRecords.length,
        unreferencedObjectCount: objectRecords.filter(
          (record) => !attachedPaths.has(record.path),
        ).length,
        objects: objectRecords,
      };
      await writeFile(
        path.join(workspace, "manifest.json"),
        `${JSON.stringify(manifest, null, 2)}\n`,
        { mode: 0o600 },
      );
    } finally {
      await db.end();
    }

    await run("tar", ["-czf", archivePath, "-C", workspace, "."], secrets);
    await chmod(archivePath, 0o600);
    await run("age", ["--encrypt", "--recipient", recipient, "--output", encryptedPath, archivePath], secrets);
    await chmod(encryptedPath, 0o600);
    const encryptedSha256 = await sha256File(encryptedPath);
    const manifest = {
      encryptedSha256,
    };
    await uploadAndPrune(encryptedPath, manifest, config, secrets);
    console.log(`Encrypted ${kind} backup uploaded and verified: ${config.date}/${config.runId}`);
  } finally {
    await rm(workspace, { recursive: true, force: true });
    await rm(archivePath, { force: true });
    await rm(encryptedPath, { force: true });
  }
}

const invokedPath = process.argv[1] && path.resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Production backup failed: ${error.message}`);
    process.exitCode = 1;
  });
}
