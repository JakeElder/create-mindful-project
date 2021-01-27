import fetch from "node-fetch";

type VercelEnvVariable = {
  type: "plain" | "secret" | "system";
  key: string;
  value: string;
  target: ("development" | "preview" | "production")[];
};

async function vercel(
  method: "POST" | "GET",
  endpoint: string,
  params: { [key: string]: any }
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
    console.log(await r.json());
    throw new Error("Failed Vercel API call");
  }

  return r.json();
}

export async function createProject({
  name,
  domain,
  env = [],
}: {
  name: string;
  domain: string;
  env?: VercelEnvVariable[];
}) {
  const project = await vercel("POST", "/v6/projects", { name });
  await vercel("POST", `/v1/projects/${project.id}/alias`, {
    domain,
  });

  if (env.length > 0) {
    await Promise.all(
      env.map((e) => vercel("POST", `/v6/projects/${project.id}/env`, e))
    );
  }

  return project;
}
