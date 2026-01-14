import { MongoClient } from "mongodb";
import vm from "vm";

let client: MongoClient | null = null;

async function getClient() {
  if (client) return client;

  const url = process.env.MONGO_URL;
  if (!url) throw new Error("MONGO_URL environment variable is not set");

  client = new MongoClient(url);
  await client.connect();
  return client;
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
        const mongoContext = {
          db: {
            getSiblingDB: (dbName) => db.client.db(dbName),
            getCollection: (name) => db.collection(name),
            adminCommand: (cmd) => db.admin().command(cmd),
            serverStatus: () => db.admin().serverStatus(),
          },
          // Collection proxy
          collection: (name) => db.collection(name)
        };

        const dbProxy = mongoContext.db;
        let codeToRun = "${finalCode}";
        
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

    return await execute(db, handleResult);
  } catch (error: any) {
    console.error("Mongo execution error:", error);
    throw new Error(error.message);
  }
}
