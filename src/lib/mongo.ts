import DigestFetch from "digest-fetch";

export class UserAlreadyExistsError extends Error {}

let df: any;

export function setAuth(userId: string, userToken: string) {
  df = new DigestFetch(userId, userToken);
}

class MongoRequestError extends Error {
  constructor(e: any) {
    super(e.detail);
    Object.assign(this, e);
  }
}

async function mongo(
  method: "POST" | "GET",
  endpoint: string,
  params?: { [key: string]: any }
) {
  const r = await df.fetch(
    `https://cloud.mongodb.com/api/atlas/v1.0/groups${endpoint}`,
    {
      method,
      ...(params && { body: JSON.stringify(params) }),
      headers: {
        ...(method === "POST" && { "Content-Type": "application/json" }),
      },
    }
  );

  if (!r.ok) {
    throw new MongoRequestError(await r.json());
  }

  return r.json();
}

export async function getUser(projectId: string, name: string) {
  try {
    const user = await mongo(
      "GET",
      `/${projectId}/databaseUsers/admin/${name}`
    );
    return user;
  } catch (e) {
    if (e.errorCode === "USERNAME_NOT_FOUND") {
      return null;
    }
    throw e;
  }
}

export async function createUser(
  projectId: string,
  name: string,
  password: string
) {
  const r = await mongo("POST", `/${projectId}/databaseUsers`, {
    databaseName: "admin",
    username: name,
    groupId: projectId,
    password,
    roles: [
      { databaseName: name, roleName: "dbAdmin" },
      { databaseName: name, roleName: "readWrite" },
    ],
  });

  if (r.errorCode && r.errorCode === "USER_ALREADY_EXISTS") {
    throw new UserAlreadyExistsError();
  }
}

export async function getConnectionString(projectId: string) {
  const { srvAddress } = await mongo("GET", `/${projectId}/clusters/Standard`);
  return srvAddress;
}
