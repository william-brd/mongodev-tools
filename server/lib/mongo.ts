import type { Document } from "mongodb";
import { MongoClient } from "mongodb";
//import vm from "vm";

let client: MongoClient | null = null;

async function getClient() {
  if (client) return client;

  const url = process.env.MONGO_URL;
  if (!url) throw new Error("MONGO_URL environment variable is not set");

  client = new MongoClient(url);
  await client.connect();
  return client;
}

function createDbProxy(db: any, client: MongoClient) {
  const helpers = {
    getSiblingDB: (dbName: string) => createDbProxy(client.db(dbName), client),
    getCollection: (name: string) => db.collection(name),
    adminCommand: (cmd: Document) => db.admin().command(cmd),
    serverStatus: () => db.admin().serverStatus(),
    collection: (name: string) => db.collection(name),
  };

  return new Proxy(db, {
    get(target, prop, receiver) {
      if (prop in helpers) {
        return helpers[prop as keyof typeof helpers];
      }
      const value = Reflect.get(target, prop, receiver);
      if (
        value === undefined &&
        typeof prop === "string" &&
        prop in target === false
      ) {
        return target.collection(prop);
      }
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
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

    // Use a direct approach to execute the code
    const execute = new Function(
      "db",
      "handleResult",
      `
      return (async () => {
        // Basic mapping for common shell methods not present in Node.js driver
        const dbProxy = db;
        let codeToRun = ${JSON.stringify(finalCode)};
        
        // More robust replacement for db. usage
        if (codeToRun.includes('db.')) {
           // We use a more direct approach: providing dbProxy as 'db' in the eval scope
           const result = await (async (db) => {
              return await eval(codeToRun);
           })(dbProxy);
           return await handleResult(result);
        }

        if (!codeToRun.startsWith('db.')) {
          codeToRun = 'db.' + codeToRun;
        }
        
        const result = await eval(codeToRun);
        return await handleResult(result);
      })()
    `
    );
    return await execute(createDbProxy(db, client), handleResult);
  } catch (error: any) {
    console.error("Mongo execution error:", error);
    throw new Error(error.message);
  }
}

/*
// Converte cursores/iteráveis do driver em array
async function normalizeResult(res: any) {
  if (!res) return res;

  // find(), aggregate() => cursor com toArray()
  if (typeof res.toArray === "function") return await res.toArray();

  // Cursor async-iterable
  if (typeof res[Symbol.asyncIterator] === "function") {
    const out = [];
    for await (const doc of res) out.push(doc);
    return out;
  }

  return res;
}

// Cria um "db shell" compatível com mongosh (parcial, mas bem útil)
function makeDbShell(mongoClient: MongoClient, dbName: string) {
  const realDb = mongoClient.db(dbName);

  const shell: any = {
    // mongosh-like helpers
    getSiblingDB: (name: string) => makeDbShell(mongoClient, name),
    getCollection: (name: string) => realDb.collection(name),

    // atalhos comuns
    collection: (name: string) => realDb.collection(name),
    adminCommand: (cmd: any) => realDb.admin().command(cmd),

    // caso alguém use db.command(...)
    command: (cmd: any) => realDb.command(cmd),

    // expõe o nome do DB
    _name: dbName,
  };

  // Permite db.minhaCollection.find(...) (shell style)
  return new Proxy(shell, {
    get(target, prop) {
      if (prop in target) return (target as any)[prop];
      if (typeof prop === "string") {
        // db.versionamento => Collection
        return realDb.collection(prop);
      }
      return undefined;
    },
  });
}

export async function executeMongoScript(
  code: string,
  type: "query" | "aggregation"
) {
  const mongoClient = await getClient();

  // Se quiser controlar db default via env, dá pra trocar aqui
  const defaultDbName = process.env.MONGO_DB || "test";
  const db = makeDbShell(mongoClient, defaultDbName);

  try {
    const finalCode = code.trim().replace(/;+\s*$/, "");

    // Sandbox: não exponha process/require por padrão
    const sandbox: any = {
      db,
      // Se quiser, exponha BSON helpers:
      // ObjectId,
      // Long,
      // Decimal128,
      // Date,
      console: {
        log: (...args: any[]) => console.log("[mongo-script]", ...args),
        error: (...args: any[]) => console.error("[mongo-script]", ...args),
      },
    };

    const context = vm.createContext(sandbox);

    // Envolve em async IIFE pra suportar await
    // Importante: não colocar o code dentro de string interpolada (evita quebrar regex/quotes)
    const wrapped = `
      (async () => {
        return (${finalCode});
      })()
    `;

    const script = new vm.Script(wrapped, { filename: "mongo-script.vm" });

    const result = await script.runInContext(context, {
      timeout: 10_000, // evita travar o node
    });

    return await normalizeResult(result);
  } catch (error: any) {
    console.error("Mongo execution error:", error);
    throw new Error(`Execution failed: ${error?.message || String(error)}`);
  }
}
*/
