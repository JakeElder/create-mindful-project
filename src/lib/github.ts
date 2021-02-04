import { Octokit } from "@octokit/core";
import sodium from "tweetsodium";

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

export async function getRepo(repo: string) {
  try {
    const r = await octokit.request(`GET /repos/mindful-studio/${repo}`, {
      org: "mindful-studio",
      repo,
    });
    return r.data;
  } catch (e) {
    return null;
  }
}

export async function createRepo({ name }: { name: string }): Promise<string> {
  const r = await octokit.request("POST /orgs/mindful-studio/repos", {
    org: "mindful-studio",
    name,
  });
  return r.data;
}

export async function addSecrets(
  repo: string,
  secrets: Record<string, string>
) {
  const owner = "mindful-studio";
  const {
    data: key,
  } = await octokit.request(
    `GET /repos/${owner}/${repo}/actions/secrets/public-key`,
    { owner, repo }
  );

  const encryptedSecrets = Object.keys(secrets).map((name) => {
    const messageBytes = Buffer.from(secrets[name]);
    const keyBytes = Buffer.from(key.key, "base64");
    const encryptedBytes = sodium.seal(messageBytes, keyBytes);
    const encryptedValue = Buffer.from(encryptedBytes).toString("base64");
    return { name, value: encryptedValue };
  });

  await Promise.all(
    encryptedSecrets.map(({ name, value }) =>
      addSecret({ repo, name, value, keyId: key.key_id })
    )
  );
}

async function addSecret({
  repo,
  name,
  value,
  keyId,
}: {
  repo: string;
  name: string;
  value: string;
  keyId: string;
}) {
  const owner = "mindful-studio";
  await octokit.request(`PUT /repos/${owner}/${repo}/actions/secrets/${name}`, {
    owner,
    repo,
    secret_name: name,
    encrypted_value: value,
    key_id: keyId,
  });
}
