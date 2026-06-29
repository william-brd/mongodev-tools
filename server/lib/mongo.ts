import type { Document } from "mongodb";
import { MongoClient } from "mongodb";
import vm from "vm";

let client: MongoClient | null = null;
let connectPromise: Promise<MongoClient> | null = null;

async function createAndConnectClient(url: string) {
  const hasDirectFlag = /directConnection=/i.test(url);
  const hasReplicaSet = /replicaSet=/i.test(url);
  const c = new MongoClient(url, {
    ...(hasDirectFlag || hasReplicaSet ? {} : { directConnection: true }),
    serverSelectionTimeoutMS: 5_000,
    connectTimeoutMS: 10_000,
    socketTimeoutMS: 45_000,
  });
  await c.connect();
  client = c;
  return c;
}

// Exportado para que browser.ts reutilize o mesmo singleton (D8)
export { getClient as getMongoClient };

function isTopologyClosed(error: unknown) {
  const e = error as { message?: string; name?: string } | null;
  return (
    e?.name === "MongoTopologyClosedError" ||
    e?.message?.includes("Topology is closed")
  );
}

async function getClient() {
  const raw = process.env.MONGO_URL ?? "";
  const url = raw.replace(/^["']|["']$/g, "").trim();
  if (!url) throw new Error("MONGO_URL environment variable is not set");
  if (!url.startsWith("mongodb://") && !url.startsWith("mongodb+srv://")) {
    throw new Error(`MONGO_URL inválida: valor atual = "${url.slice(0, 30)}..." (remova aspas do env_file)`);
  }

  if (client) {
    try {
      await client.db("admin").command({ ping: 1 });
      return client;
    } catch (error) {
      if (!isTopologyClosed(error)) throw error;
      client = null;
    }
  }

  if (!connectPromise) {
    connectPromise = createAndConnectClient(url).finally(() => {
      connectPromise = null;
    });
  }

  return connectPromise;
}

// ── Cursor wrapper — mongosh-compatible method aliases ────────────────────────

function wrapCursor(cursor: any): any {
  return new Proxy(cursor, {
    get(target, prop) {
      switch (prop) {
        // mongosh: .projection(proj) → driver: .project(proj)
        case "projection":
          return (proj: Document) => wrapCursor(target.project(proj));

        // mongosh: .showDiskLoc() → driver: .showRecordId(true)
        case "showDiskLoc":
          return () => wrapCursor(target.showRecordId(true));

        // mongosh: .readPref(mode) → driver: .withReadPreference(mode)
        case "readPref":
          return (mode: string) => wrapCursor(target.withReadPreference(mode as any));

        // mongosh: cursor.itcount() — count all remaining items
        case "itcount":
          return async () => {
            const arr = await target.clone().toArray();
            return arr.length;
          };

        // mongosh: cursor.count() — total matching docs (ignores skip/limit)
        case "count":
          return async () => {
            const arr = await target.clone().toArray();
            return arr.length;
          };

        // mongosh: cursor.size() — same as count()
        case "size":
          return async () => {
            const arr = await target.clone().toArray();
            return arr.length;
          };

        // mongosh: cursor.pretty() — no-op here (JSON is always pretty)
        case "pretty":
          return () => wrapCursor(target);

        // mongosh: cursor.shellPrint() — no-op
        case "shellPrint":
          return () => wrapCursor(target);

        default: {
          const value = target[prop];
          if (typeof value === "function") {
            return (...args: any[]) => {
              const result = value.apply(target, args);
              // Re-wrap if result is still a cursor (has toArray, not a Promise)
              if (
                result &&
                typeof result === "object" &&
                typeof result.toArray === "function" &&
                typeof result.then !== "function"
              ) {
                return wrapCursor(result);
              }
              return result;
            };
          }
          return value;
        }
      }
    },
  });
}

// ── Collection wrapper — mongosh-compatible methods ───────────────────────────

function wrapCollection(col: any, db: any): any {
  const colName: string = col.collectionName;

  const aliases: Record<string, (...args: any[]) => any> = {
    // ── rename ──────────────────────────────────────────────────────────────
    // col.rename() retorna o objeto Collection (circular) — retornamos objeto simples
    renameCollection: async (newName: string, dropTarget = false) => {
      await col.rename(newName, { dropTarget });
      return { ok: 1, ns: `${db.databaseName}.${newName}` };
    },

    // ── count ───────────────────────────────────────────────────────────────
    count: (filter: Document = {}, opts?: any) =>
      col.countDocuments(filter, opts),

    // ── index management ────────────────────────────────────────────────────
    ensureIndex: (keys: Document, opts?: any) => col.createIndex(keys, opts),
    getIndexes: () => col.listIndexes().toArray(),
    getIndexSpecs: () => col.listIndexes().toArray(),
    getIndexKeys: async () => {
      const indexes = await col.listIndexes().toArray();
      return indexes.map((i: any) => i.key);
    },
    getIndexNames: async () => {
      const indexes = await col.listIndexes().toArray();
      return indexes.map((i: any) => i.name);
    },
    dropAllIndexes: () => col.dropIndexes(),
    reIndex: () => db.command({ reIndex: colName }),

    // ── stats & info ────────────────────────────────────────────────────────
    stats: (scale = 1) => db.command({ collStats: colName, scale }),
    validate: (full = false) => db.command({ validate: colName, full }),
    compact: () => db.command({ compact: colName }),
    isCapped: async () => {
      const s = await db.command({ collStats: colName });
      return !!s.capped;
    },
    convertToCapped: (size: number) =>
      db.command({ convertToCapped: colName, size }),
    totalSize: async (scale = 1) => {
      const s = await db.command({ collStats: colName, scale });
      return s.totalSize;
    },
    storageSize: async (scale = 1) => {
      const s = await db.command({ collStats: colName, scale });
      return s.storageSize;
    },
    dataSize: async () => {
      const s = await db.command({ collStats: colName });
      return s.size;
    },
    totalIndexSize: async (scale = 1) => {
      const s = await db.command({ collStats: colName, scale });
      return s.totalIndexSize;
    },
    latencyStats: (opts?: any) =>
      col.aggregate([{ $collStats: { latencyStats: opts ?? {} } }]).toArray(),
    explain: (verbosity = "queryPlanner") =>
      db.command({ explain: { count: colName }, verbosity }),

    // ── namespace info ───────────────────────────────────────────────────────
    getFullName: () => `${db.databaseName}.${colName}`,
    getName: () => colName,

    // ── deprecated mongosh write helpers ─────────────────────────────────────
    // db.col.save(doc) → insert or upsert by _id
    save: async (doc: any) => {
      if (doc && doc._id != null) {
        return col.replaceOne({ _id: doc._id }, doc, { upsert: true });
      }
      return col.insertOne(doc);
    },

    // db.col.update(filter, update, {upsert, multi})
    update: (filter: Document, update: Document, opts: any = {}) => {
      if (opts.multi) return col.updateMany(filter, update, opts);
      return col.updateOne(filter, update, opts);
    },

    // db.col.remove(filter, {justOne})
    remove: (filter: Document = {}, opts: any = {}) => {
      if (opts.justOne || opts === true) return col.deleteOne(filter);
      return col.deleteMany(filter);
    },

    // db.col.findAndModify({query, update, remove, sort, new, fields, upsert})
    findAndModify: (opts: any = {}) => {
      const { query = {}, update, remove, sort, new: returnNew, fields, upsert } = opts;
      if (remove) {
        return col.findOneAndDelete(query, { sort, projection: fields });
      }
      return col.findOneAndUpdate(query, update, {
        sort,
        projection: fields,
        upsert: !!upsert,
        returnDocument: returnNew ? "after" : "before",
      });
    },

    // db.col.insert(doc | [docs])
    insert: (docOrDocs: any) =>
      Array.isArray(docOrDocs)
        ? col.insertMany(docOrDocs)
        : col.insertOne(docOrDocs),

    // db.col.copyTo(newName) — mongosh deprecated
    copyTo: async (newName: string) => {
      const docs = await col.find({}).toArray();
      if (docs.length === 0) return { ok: 1, n: 0 };
      const target = db.collection(newName);
      const result = await target.insertMany(docs);
      return { ok: 1, n: result.insertedCount };
    },

    // db.col.getDB() → the db this collection belongs to
    getDB: () => createDbProxy(db, db.client ?? db),
  };

  return new Proxy(col, {
    get(target, prop) {
      if (prop === "find" || prop === "aggregate") {
        return (...args: any[]) => wrapCursor(target[prop](...args));
      }
      if (typeof prop === "string" && prop in aliases) {
        return aliases[prop as string];
      }
      const value = target[prop];
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

// ── DB proxy — mongosh-compatible db.* methods ────────────────────────────────

function createDbProxy(db: any, mongoClient: MongoClient): any {
  const dbHelpers: Record<string, any> = {
    // collection access
    getSiblingDB: (dbName: string) => createDbProxy(mongoClient.db(dbName), mongoClient),
    getCollection: (name: string) => wrapCollection(db.collection(name), db),
    collection: (name: string) => wrapCollection(db.collection(name), db),

    // metadata
    getName: () => db.databaseName,
    getCollectionNames: async () => {
      const cols = await db.listCollections().toArray();
      return cols.map((c: any) => c.name);
    },
    getCollectionInfos: (filter?: Document) => db.listCollections(filter).toArray(),
    getCollections: async () => {
      const names: string[] = await (await db.listCollections().toArray()).map((c: any) => c.name);
      return names.map((n) => wrapCollection(db.collection(n), db));
    },

    // commands
    runCommand: (cmd: Document) => db.command(cmd),
    adminCommand: (cmd: Document) => db.admin().command(cmd),

    // stats
    stats: (scale = 1) => db.command({ dbStats: 1, scale }),
    serverStatus: () => db.admin().serverStatus(),
    currentOp: (filter?: Document) =>
      db.admin().command({ currentOp: 1, ...(filter ?? {}) }),
    killOp: (opid: number) => db.admin().command({ killOp: 1, op: opid }),

    // profiling
    getProfilingStatus: () => db.command({ profile: -1 }),
    setProfilingLevel: (level: number, opts: any = {}) =>
      db.command({ profile: level, ...opts }),

    // db lifecycle
    dropDatabase: () => db.dropDatabase(),
    createCollection: (name: string, opts?: Document) =>
      db.createCollection(name, opts),
    repairDatabase: () => db.admin().command({ repairDatabase: 1 }),

    // server info
    version: async () => {
      const info = await db.admin().serverInfo();
      return info.version;
    },
    hostInfo: () => db.admin().command({ hostInfo: 1 }),
    hello: () => db.command({ hello: 1 }),
    isMaster: () => db.command({ isMaster: 1 }),
    listCommands: () => db.command({ listCommands: 1 }),
    serverBuildInfo: () => db.admin().serverInfo(),

    // logging
    getLogComponents: () => db.admin().command({ getLog: "global" }),
    setLogLevel: (level: number, component?: string) => {
      const cmd: any = { setParameter: 1, logLevel: level };
      if (component) cmd.component = component;
      return db.admin().command(cmd);
    },

    // misc
    printCollectionStats: async (scale = 1) => {
      const cols = await db.listCollections().toArray();
      const results: Record<string, any> = {};
      for (const c of cols) {
        try {
          results[c.name] = await db.command({ collStats: c.name, scale });
        } catch {
          results[c.name] = { error: "could not fetch stats" };
        }
      }
      return results;
    },
    fsyncLock: () => db.admin().command({ fsync: 1, lock: true }),
    fsyncUnlock: () => db.admin().command({ fsyncUnlock: 1 }),
  };

  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop !== "string") return undefined;
        if (prop in dbHelpers) return dbHelpers[prop];

        // Native db property (e.g. databaseName, command, etc.)
        const native = (db as Record<string, unknown>)[prop];
        if (native !== undefined) {
          return typeof native === "function" ? (native as Function).bind(db) : native;
        }

        // Dynamic collection access: db.myCollection
        return wrapCollection(db.collection(prop), db);
      },
    }
  );
}

// ── Public execute function ───────────────────────────────────────────────────

export async function executeMongoScript(
  code: string,
  type: "query" | "aggregation",
  dbName?: string,
) {
  const mongoClient = await getClient();
  const db = mongoClient.db(dbName || undefined);

  try {
    let finalCode = code.trim();
    if (finalCode.endsWith(";")) finalCode = finalCode.slice(0, -1);

    const safeSerialize = (val: any): any => {
      // Detecta objetos que não são serializáveis (MongoClient, Collection, Db, etc.)
      // checando se têm propriedades típicas do driver que causam circular ref
      if (val && typeof val === "object") {
        if (typeof val.toArray === "function") return val; // cursor, tratado abaixo
        if (val.constructor?.name === "Collection") return { ok: 1, ns: `${val.dbName}.${val.collectionName}` };
        if (val.constructor?.name === "Db") return { ok: 1, db: val.databaseName };
        if (val.constructor?.name === "MongoClient") return { ok: 1, type: "MongoClient" };
      }
      return val;
    };

    const RESULT_DOC_LIMIT = 50_000;

    const handleResult = async (res: any): Promise<any> => {
      if (res === null || res === undefined) return res;
      res = safeSerialize(res);
      if (typeof res.toArray === "function") return res.toArray();
      if (typeof res.next === "function" && typeof res.hasNext === "function") {
        const results = [];
        while (await res.hasNext()) {
          if (results.length >= RESULT_DOC_LIMIT)
            throw new Error(`Resultado limitado a ${RESULT_DOC_LIMIT.toLocaleString()} documentos — use filtros para reduzir o conjunto`);
          results.push(await res.next());
        }
        return results;
      }
      return res;
    };

    const dbProxy = createDbProxy(db, mongoClient);

    let codeToRun = finalCode;
    if (!codeToRun.includes("db.")) {
      codeToRun = `db.${codeToRun}`;
    }

    // Contexto mínimo: apenas db e handleResult. Object.freeze impede que código
    // do usuário adicione propriedades ao sandbox e dificulta escapes via prototype.
    const sandbox = Object.create(null) as Record<string, unknown>;
    sandbox.db = dbProxy;
    sandbox.handleResult = handleResult;
    Object.freeze(sandbox);

    const context = vm.createContext(sandbox);
    const scriptSource =
      '"use strict";\n' +
      "(async () => { const __result = await (async () => (" +
      codeToRun +
      "))(); return await handleResult(__result); })()";

    const script = new vm.Script(scriptSource, { filename: "mongo-script.js" });
    // timeout: impede loops infinitos (10s). runInContext retorna a Promise;
    // o timeout aplica-se à compilação + início da execução síncrona.
    return await script.runInContext(context, { timeout: 10_000 });
  } catch (error: any) {
    console.error("Mongo execution error:", error);
    throw new Error(error.message);
  }
}
