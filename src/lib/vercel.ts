import fetch from "node-fetch";

type VercelEnvVariable = {
  type: "plain" | "secret" | "system";
  key: string;
  value: string;
  target: ("development" | "preview" | "production")[];
};

class VercelRequestError extends Error {
  constructor(e: any) {
    super(e.detail);
    Object.assign(this, e);
  }
}

async function vercel(
  method: "POST" | "GET" | "PATCH",
  endpoint: string,
  params?: { [key: string]: any }
) {
  const r = await fetch(`https://api.vercel.com${endpoint}`, {
    method,
    ...(params && { body: JSON.stringify(params) }),
    headers: {
      ...(method === "POST" && { "Content-Type": "application/json" }),
      Authorization: `Bearer ${process.env.VERCEL_TOKEN}`,
    },
  });

  if (!r.ok) {
    throw new VercelRequestError(await r.json());
  }

  return r.json();
}

export async function getProject(name: string) {
  try {
    const project = await vercel("GET", `/v6/projects/${name}`);
    return project;
  } catch (e) {
    return null;
  }
}

export async function createProject({
  name,
  domain,
  env = [],
  framework,
}: {
  name: string;
  domain: string;
  env?: VercelEnvVariable[];
  framework?: string;
}) {
  const project = await vercel("POST", "/v6/projects", { name });
  await vercel("POST", `/v1/projects/${project.id}/alias`, {
    domain,
  });

  if (typeof framework === "string") {
    await vercel("PATCH", `/v2/projects/${project.id}`, { framework });
  }

  if (env.length > 0) {
    await Promise.all(
      env.map((e) => vercel("POST", `/v6/projects/${project.id}/env`, e))
    );
  }

  return project;
}

export async function getSecretId(secretName: string) {
  const { uid } = await vercel("GET", `/v3/now/secrets/${secretName}`);
  return uid;
}
