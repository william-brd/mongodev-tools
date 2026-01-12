import { MongoClient } from 'mongodb';
import vm from 'vm';

let client: MongoClient | null = null;

async function getClient() {
  if (client) return client;
  
  const url = process.env.MONGO_URL;
  if (!url) throw new Error("MONGO_URL environment variable is not set");
  
  client = new MongoClient(url);
  await client.connect();
  return client;
}

export async function executeMongoScript(code: string, type: 'query' | 'aggregation') {
  const client = await getClient();
  const db = client.db(); // Default DB from connection string
  
  // Sandbox context
  const sandbox = {
    db,
    result: null as any,
    console: {
      log: (...args: any[]) => { /* capture logs if needed */ }
    }
  };

  const context = vm.createContext(sandbox);
  
  // Wrap code to assign result
  // User code expected: "db.collection('foo').find().toArray()"
  // We wrap it: "async function run() { result = await ... } run()"
  
  const wrappedCode = `
    (async () => {
      try {
        const res = ${code};
        // Handle if it's a cursor or promise
        if (res && typeof res.toArray === 'function') {
           result = await res.toArray();
        } else if (res instanceof Promise) {
           result = await res;
        } else {
           result = res;
        }
      } catch (e) {
        throw e;
      }
    })()
  `;

  try {
    await vm.runInContext(wrappedCode, context, { timeout: 10000 });
    return sandbox.result;
  } catch (error: any) {
    throw new Error(`Execution failed: ${error.message}`);
  }
}
