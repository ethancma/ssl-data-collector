// Runs dbQuery SQL over one persistent Postgres connection so the synchronous helper avoids a CLI spawn per query.
import { workerData } from "node:worker_threads";
import pg from "pg";

const { url, port, signal } = workerData;

// Match the Supabase CLI's JSON encoding the section scripts were written against.
pg.types.setTypeParser(20, Number);
const int8Array = pg.types.getTypeParser(1016);
pg.types.setTypeParser(1016, (value) => int8Array(value).map((v) => (v === null ? null : Number(v))));
pg.types.setTypeParser(1082, (value) => `${value}T00:00:00Z`);
pg.types.setTypeParser(1114, (value) => `${value.replace(" ", "T")}Z`);
pg.types.setTypeParser(1184, (value) => value.replace(" ", "T").replace(/\+00(:00)?$/, "Z"));

const client = new pg.Client({ connectionString: url });
const ready = client.connect().then(() => client.query("set time zone 'UTC'"));

port.on("message", async (sql) => {
  let reply;
  try {
    await ready;
    const result = await client.query(sql);
    const last = (Array.isArray(result) ? result : [result]).filter((r) => r.fields?.length).at(-1);
    reply = { rows: last?.rows ?? [] };
  } catch (error) {
    reply = { error: error instanceof Error ? error.message : String(error) };
  }
  port.postMessage(reply);
  Atomics.store(signal, 0, 1);
  Atomics.notify(signal, 0);
});
