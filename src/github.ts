import { Octokit } from "@octokit/core";
import sodium from "tweetsodium";

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

type GithubError = {
  field: string;
  code: string;
};

export async function createRepo({
  name,
  replaceTakenRepoName,
}: {
  name: string;
  replaceTakenRepoName: (takenId: string) => Promise<string>;
}): Promise<string> {
  try {
    const r = await octokit.request("POST /orgs/mindful-studio/repos", {
      org: "mindful-studio",
      name,
    });
    return r.data.ssh_url;
  } catch (e) {
    const hasNameTakenError = e.errors.some(
      (e: GithubError) => e.field === "name" && e.code === "custom"
    );
    if (hasNameTakenError) {
      const compromiseName = await replaceTakenRepoName(name);
      return createRepo({ name: compromiseName, replaceTakenRepoName });
    } else {
      throw e;
    }
  }
}

type SecretMap = {
  [key: string]: string;
};

export async function addSecrets(repo: string, secrets: SecretMap) {
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
