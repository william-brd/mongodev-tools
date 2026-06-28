import { MongoClient, ObjectId, type Document } from "mongodb";
import { stringify } from "csv-stringify/sync";

let _client: MongoClient | null = null;
let _connectPromise: Promise<MongoClient> | null = null;

function isTopologyClosed(err: unknown) {
  const e = err as { name?: string; message?: string } | null;
  return (
    e?.name === "MongoTopologyClosedError" ||
    e?.message?.includes("Topology is closed")
  );
}

export async function getMongoClient(): Promise<MongoClient> {
  // Docker Stack (env_file) às vezes inclui as aspas como parte do valor.
  // Ex: MONGO_URL="mongodb://..." → process.env.MONGO_URL = '"mongodb://..."'
  const raw = process.env.MONGO_URL ?? "";
  const url = raw.replace(/^["']|["']$/g, "").trim();
  if (!url) throw new Error("MONGO_URL not set");
  if (!url.startsWith("mongodb://") && !url.startsWith("mongodb+srv://")) {
    throw new Error(`MONGO_URL inválida: valor atual = "${url.slice(0, 30)}..." (remova aspas do env_file)`);
  }

  if (_client) {
    try {
      await _client.db("admin").command({ ping: 1 });
      return _client;
    } catch (e) {
      if (!isTopologyClosed(e)) throw e;
      _client = null;
    }
  }

  if (!_connectPromise) {
    _connectPromise = (async () => {
      const hasDirectFlag = /directConnection=/i.test(url);
      const hasReplicaSet = /replicaSet=/i.test(url);
      const options = hasDirectFlag || hasReplicaSet ? {} : { directConnection: true };
      const c = new MongoClient(url, options);
      await c.connect();
      _client = c;
      return c;
    })().finally(() => (_connectPromise = null));
  }

  return _connectPromise;
}

function serializeDoc(doc: unknown): unknown {
  if (doc === null || doc === undefined) return doc;
  if (doc instanceof ObjectId) return { $oid: doc.toHexString() };
  if (doc instanceof Date) return { $date: doc.toISOString() };
  if (Buffer.isBuffer(doc)) return { $binary: doc.toString("base64") };
  if (Array.isArray(doc)) return doc.map(serializeDoc);
  if (typeof doc === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(doc as Record<string, unknown>)) {
      out[k] = serializeDoc(v);
    }
    return out;
  }
  return doc;
}

function deserializeDoc(doc: unknown): unknown {
  if (doc === null || doc === undefined) return doc;
  if (Array.isArray(doc)) return doc.map(deserializeDoc);
  if (typeof doc === "object") {
    const obj = doc as Record<string, unknown>;
    if ("$oid" in obj && typeof obj["$oid"] === "string")
      return new ObjectId(obj["$oid"]);
    if ("$date" in obj && typeof obj["$date"] === "string")
      return new Date(obj["$date"]);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = deserializeDoc(v);
    }
    return out;
  }
  return doc;
}

// ---------- databases ----------

export async function listDatabases() {
  const client = await getMongoClient();
  const result = await client.db("admin").admin().listDatabases();
  return result.databases.map((d) => ({
    name: d.name,
    sizeOnDisk: d.sizeOnDisk ?? 0,
    empty: d.empty ?? false,
  }));
}

// ---------- collections ----------

export async function listCollections(dbName: string) {
  const client = await getMongoClient();
  const collections = await client.db(dbName).listCollections().toArray();
  return collections.map((c) => ({
    name: c.name,
    type: c.type ?? "collection",
    options: (c as any).options ?? {},
  }));
}

export async function createCollection(dbName: string, colName: string) {
  const client = await getMongoClient();
  await client.db(dbName).createCollection(colName);
}

export async function dropCollection(dbName: string, colName: string) {
  const client = await getMongoClient();
  await client.db(dbName).collection(colName).drop();
}

export async function getCollectionStats(dbName: string, colName: string) {
  const client = await getMongoClient();
  const stats = await client
    .db(dbName)
    .command({ collStats: colName, scale: 1 });
  return serializeDoc(stats);
}

export async function getDatabaseStats(dbName: string) {
  const client = await getMongoClient();
  const stats = await client.db(dbName).command({ dbStats: 1, scale: 1 });
  return serializeDoc(stats);
}

// ---------- documents ----------

export async function findDocuments(
  dbName: string,
  colName: string,
  opts: {
    filter?: string;
    sort?: string;
    projection?: string;
    limit?: number;
    skip?: number;
  }
) {
  const client = await getMongoClient();
  const col = client.db(dbName).collection(colName);

  let filter: Document = {};
  let sort: Document = {};
  let projection: Document = {};

  const safeFilter = opts.filter?.trim() || "{}";
  const safeSort = opts.sort?.trim() || "{}";
  const safeProjection = opts.projection?.trim() || "{}";

  try {
    if (safeFilter !== "{}") filter = JSON.parse(safeFilter);
  } catch (e: any) {
    throw new Error(`Filtro inválido: ${e.message} — valor recebido: ${safeFilter}`);
  }
  try {
    if (safeSort !== "{}") sort = JSON.parse(safeSort);
  } catch (e: any) {
    throw new Error(`Sort inválido: ${e.message}`);
  }
  try {
    if (safeProjection !== "{}") projection = JSON.parse(safeProjection);
  } catch (e: any) {
    throw new Error(`Projection inválida: ${e.message}`);
  }

  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 1000);
  const skip = Math.max(opts.skip ?? 0, 0);

  const [docs, total] = await Promise.all([
    col.find(filter, { projection }).sort(sort).skip(skip).limit(limit).toArray(),
    col.countDocuments(filter),
  ]);

  return { docs: docs.map(serializeDoc), total };
}

export async function countDocuments(
  dbName: string,
  colName: string,
  filter: string
) {
  const client = await getMongoClient();
  let q: Document = {};
  try {
    if (filter?.trim() && filter.trim() !== "{}") q = JSON.parse(filter);
  } catch {
    throw new Error("Invalid filter JSON");
  }
  return client.db(dbName).collection(colName).countDocuments(q);
}

export async function insertDocument(
  dbName: string,
  colName: string,
  doc: unknown
) {
  const client = await getMongoClient();
  const deserialized = deserializeDoc(doc) as Document;
  const result = await client.db(dbName).collection(colName).insertOne(deserialized);
  return { insertedId: result.insertedId.toHexString() };
}

export async function updateDocument(
  dbName: string,
  colName: string,
  id: string,
  update: unknown
) {
  const client = await getMongoClient();
  const oid = new ObjectId(id);
  const updateDoc = deserializeDoc(update) as Document;

  const hasOperator = Object.keys(updateDoc).some((k) => k.startsWith("$"));
  const op = hasOperator ? updateDoc : { $set: updateDoc };

  const result = await client
    .db(dbName)
    .collection(colName)
    .updateOne({ _id: oid }, op);
  return { matchedCount: result.matchedCount, modifiedCount: result.modifiedCount };
}

export async function replaceDocument(
  dbName: string,
  colName: string,
  id: string,
  replacement: unknown
) {
  const client = await getMongoClient();
  const oid = new ObjectId(id);
  const rep = deserializeDoc(replacement) as Document;
  delete rep["_id"];
  const result = await client
    .db(dbName)
    .collection(colName)
    .replaceOne({ _id: oid }, rep);
  return { matchedCount: result.matchedCount, modifiedCount: result.modifiedCount };
}

export async function deleteDocument(
  dbName: string,
  colName: string,
  id: string
) {
  const client = await getMongoClient();
  const oid = new ObjectId(id);
  const result = await client
    .db(dbName)
    .collection(colName)
    .deleteOne({ _id: oid });
  return { deletedCount: result.deletedCount };
}

export async function bulkDeleteDocuments(
  dbName: string,
  colName: string,
  ids: string[]
) {
  const client = await getMongoClient();
  const oids = ids.map((id) => new ObjectId(id));
  const result = await client
    .db(dbName)
    .collection(colName)
    .deleteMany({ _id: { $in: oids } });
  return { deletedCount: result.deletedCount };
}

// ---------- indexes ----------

export async function listIndexes(dbName: string, colName: string) {
  const client = await getMongoClient();
  const indexes = await client.db(dbName).collection(colName).listIndexes().toArray();
  return indexes.map(serializeDoc);
}

export async function createIndex(
  dbName: string,
  colName: string,
  keys: Document,
  options: { name?: string; unique?: boolean; sparse?: boolean; background?: boolean }
) {
  const client = await getMongoClient();
  const name = await client.db(dbName).collection(colName).createIndex(keys, options);
  return { name };
}

export async function dropIndex(dbName: string, colName: string, indexName: string) {
  const client = await getMongoClient();
  await client.db(dbName).collection(colName).dropIndex(indexName);
}

// ---------- export ----------

export async function exportToJson(
  dbName: string,
  colName: string,
  filter: string
): Promise<string> {
  const client = await getMongoClient();
  let q: Document = {};
  try {
    if (filter?.trim() && filter.trim() !== "{}") q = JSON.parse(filter);
  } catch {
    throw new Error("Invalid filter JSON");
  }
  const docs = await client.db(dbName).collection(colName).find(q).toArray();
  return JSON.stringify(docs.map(serializeDoc), null, 2);
}

function flattenDoc(doc: Record<string, unknown>, prefix = ""): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(doc)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)) {
      const nested = flattenDoc(v as Record<string, unknown>, key);
      Object.assign(result, nested);
    } else {
      result[key] =
        v instanceof Date ? v.toISOString() : Array.isArray(v) ? JSON.stringify(v) : String(v ?? "");
    }
  }
  return result;
}

export async function exportToCsv(
  dbName: string,
  colName: string,
  filter: string
): Promise<string> {
  const client = await getMongoClient();
  let q: Document = {};
  try {
    if (filter?.trim() && filter.trim() !== "{}") q = JSON.parse(filter);
  } catch {
    throw new Error("Invalid filter JSON");
  }
  const docs = await client.db(dbName).collection(colName).find(q).toArray();
  if (docs.length === 0) return "";

  const serialized = docs.map((d) => serializeDoc(d) as Record<string, unknown>);
  const flat = serialized.map((d) => flattenDoc(d as Record<string, unknown>));

  const allKeys = Array.from(new Set(flat.flatMap((r) => Object.keys(r))));
  const rows = flat.map((r) => allKeys.map((k) => r[k] ?? ""));

  return stringify([allKeys, ...rows]);
}

// ---------- import ----------

export async function importDocuments(
  dbName: string,
  colName: string,
  docs: unknown[],
  mode: "insert" | "upsert" = "insert"
) {
  const client = await getMongoClient();
  const col = client.db(dbName).collection(colName);
  const deserialized = docs.map((d) => deserializeDoc(d) as Document);

  if (mode === "insert") {
    const result = await col.insertMany(deserialized, { ordered: false });
    return { insertedCount: result.insertedCount };
  }

  // upsert by _id
  let upsertedCount = 0;
  let modifiedCount = 0;
  for (const doc of deserialized) {
    const { _id, ...rest } = doc;
    if (_id) {
      const r = await col.updateOne({ _id }, { $set: rest }, { upsert: true });
      upsertedCount += r.upsertedCount;
      modifiedCount += r.modifiedCount;
    } else {
      await col.insertOne(doc);
      upsertedCount++;
    }
  }
  return { upsertedCount, modifiedCount };
}

// ---------- server status ----------

export async function getServerStatus() {
  const client = await getMongoClient();
  const status = await client.db("admin").command({ serverStatus: 1 });
  return serializeDoc(status);
}
