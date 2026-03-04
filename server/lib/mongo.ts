import type { Document } from "mongodb";
import { MongoClient } from "mongodb";
import vm from "vm";

let client: MongoClient | null = null;
let connectPromise: Promise<MongoClient> | null = null;

async function createAndConnectClient(url: string) {
  const nextClient = new MongoClient(url);
  await nextClient.connect();
  client = nextClient;
  return nextClient;
}

function isTopologyClosedError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const maybeError = error as { message?: string; name?: string };
  return (
    maybeError.name === "MongoTopologyClosedError" ||
    maybeError.message?.includes("Topology is closed")
  );
}

async function getClient() {
  const url = process.env.MONGO_URL;
  if (!url) throw new Error("MONGO_URL environment variable is not set");

  if (client) {
    try {
      await client.db("admin").command({ ping: 1 });
      return client;
    } catch (error) {
      if (!isTopologyClosedError(error)) {
        throw error;
      }
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

function createDbProxy(db: any, client: MongoClient) {
  const helpers = {
    getSiblingDB: (dbName: string) => createDbProxy(client.db(dbName), client),
    getCollection: (name: string) => db.collection(name),
    adminCommand: (cmd: Document) => db.admin().command(cmd),
    serverStatus: () => db.admin().serverStatus(),
    collection: (name: string) => db.collection(name),
  };

  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop in helpers) {
          return helpers[prop as keyof typeof helpers];
        }
        if (typeof prop === "string" && prop in db === false) {
          return db.collection(prop);
        }
        const value = (db as Record<PropertyKey, unknown>)[prop];
        return typeof value === "function" ? value.bind(db) : value;
      },
    }
  );
}

export async function executeMongoScript(
  code: string,
  type: "query" | "aggregation"
) {
  const client = await getClient();
  const db = client.db();

  try {
    let finalCode = code.trim();
    // Remove trailing semicolon if present
    if (finalCode.endsWith(";")) {
      finalCode = finalCode.slice(0, -1);
    }

    // Helper function to handle various MongoDB return types
    const handleResult = async (res: any) => {
      if (res && typeof res.toArray === "function") {
        return await res.toArray();
      }
      if (
        res &&
        typeof res.next === "function" &&
        typeof res.hasNext === "function"
      ) {
        const results = [];
        while (await res.hasNext()) {
          results.push(await res.next());
        }
        return results;
      }
      return res;
    };
    const dbProxy = createDbProxy(db, client);
    let codeToRun = finalCode;
    if (!codeToRun.includes("db.")) {
      codeToRun = `db.${codeToRun}`;
    }

    const context = vm.createContext({ db: dbProxy, handleResult });
    const scriptSource =
      "(async () => { const __result = await (async () => (" +
      codeToRun +
      "))(); return await handleResult(__result); })()";
    const script = new vm.Script(scriptSource, { filename: "mongo-script.js" });
    return await script.runInContext(context);
  } catch (error: any) {
    console.error("Mongo execution error:", error);
    throw new Error(error.message);
  }
}
