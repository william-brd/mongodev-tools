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

    // Wrap in a function that provides 'db' and executes the code
    const fn = new Function(
      "db",
      `return (async () => {
      const result = await (${finalCode});
      if (result && typeof result.toArray === 'function') {
        return await result.toArray();
      }
      return result;
    })()`
    );

    return await fn(db);
  } catch (error: any) {
    throw new Error(`Execution failed: ${error.message}`);
  }
}
