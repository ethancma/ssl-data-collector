import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";

import {
  backupsToPrune,
  inventorySignature,
  objectPath,
} from "@/scripts/production-backup.mjs";

test("Storage paths stay inside the backup directory", () => {
  assert.equal(
    objectPath("/tmp/backup", "health_observations/42/image.jpg"),
    path.join("/tmp/backup", "health_observations/42/image.jpg"),
  );
  assert.throws(() => objectPath("/tmp/backup", "../outside.jpg"));
  assert.throws(() => objectPath("/tmp/backup", "/outside.jpg"));
});

test("Storage inventory signatures detect changes to stored objects", () => {
  const before = [
    {
      name: "image.jpg",
      updated_at: "2026-10-31T12:00:00Z",
      metadata: { size: 12, mimetype: "image/jpeg", eTag: "abc" },
    },
  ];
  const after = [
    {
      name: "image.jpg",
      updated_at: "2026-10-31T12:01:00Z",
      metadata: { size: 12, mimetype: "image/jpeg", eTag: "abc" },
    },
  ];

  assert.notEqual(inventorySignature(before), inventorySignature(after));
});

test("retention preserves the latest two backups across weekly and manual runs", () => {
  const contents = [
    { Key: "weekly/old.tar.gz.age", LastModified: "2026-01-01T00:00:00Z" },
    { Key: "weekly/one.tar.gz.age", LastModified: "2026-01-08T00:00:00Z" },
    { Key: "weekly/two.tar.gz.age", LastModified: "2026-01-15T00:00:00Z" },
    { Key: "weekly/three.tar.gz.age", LastModified: "2026-01-22T00:00:00Z" },
    { Key: "weekly/current.tar.gz.age", LastModified: "2026-01-29T00:00:00Z" },
    { Key: "manual/older.tar.gz.age", LastModified: "2026-01-25T00:00:00Z" },
    { Key: "manual/current.tar.gz.age", LastModified: "2026-02-01T00:00:00Z" },
  ];

  assert.deepEqual(
    backupsToPrune(contents, "weekly/current.tar.gz.age"),
    [
      contents[5],
      contents[3],
      contents[2],
      contents[1],
      contents[0],
    ],
  );
  assert.deepEqual(
    backupsToPrune(contents, "manual/current.tar.gz.age"),
    [
      contents[5],
      contents[3],
      contents[2],
      contents[1],
      contents[0],
    ],
  );
});
