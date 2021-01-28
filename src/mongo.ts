import DigestFetch from "digest-fetch";

export class UserAlreadyExistsError extends Error {}

const df = new DigestFetch(
  process.env.MONGO_USER_ID,
  process.env.MONGO_USER_TOKEN
);

async function mongo(
  method: "POST" | "GET",
  endpoint: string,
  params?: { [key: string]: any }
) {
  const projectId = process.env.MONGO_PROJECT_ID;
  const r = await df.fetch(
    `https://cloud.mongodb.com/api/atlas/v1.0/groups/${projectId}${endpoint}`,
    {
      method,
      ...(params && { body: JSON.stringify(params) }),
      headers: {
        ...(method === "POST" && { "Content-Type": "application/json" }),
      },
    }
  );

  if (!r.ok) {
    console.log(await r.json());
    throw new Error("Failed Mongo API call");
  }

  return r.json();
}

export async function createUser(name: string, password: string) {
  const projectId = process.env.MONGO_PROJECT_ID;

  const r = await mongo("POST", `/databaseUsers`, {
    databaseName: "admin",
    username: name,
    groupId: projectId,
    password: "passwwdd",
    roles: [
      { databaseName: name, roleName: "dbAdmin" },
      { databaseName: name, roleName: "readWrite" },
    ],
  });

  if (r.errorCode && r.errorCode === "USER_ALREADY_EXISTS") {
    throw new UserAlreadyExistsError();
  }
}

export async function getConnectionString(clusterName: string) {
  const projectId = process.env.MONGO_PROJECT_ID;
  const { srvAddress } = await mongo("GET", `/clusters/${clusterName}`);
  return srvAddress;
}
