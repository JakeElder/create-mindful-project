import delay from "delay";
import { cloudresourcemanager_v1, google } from "googleapis";

type Schema$Project = cloudresourcemanager_v1.Schema$Project;

class OperationNotCompleteError extends Error {}
class InvalidOperationError extends Error {}
class InvalidProjectError extends Error {}

export async function getAuth(scopes: string[] = []) {
  const auth = new google.auth.GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform", ...scopes],
  });
  return await auth.getClient();
}

async function checkOperation<T>(operationName: string): Promise<T | null> {
  const resourcemanager = google.cloudresourcemanager("v1");
  const { data: operation } = await resourcemanager.operations.get({
    name: operationName,
    auth: await getAuth(),
  });
  if (operation.done) {
    return operation.response as T;
  }
  return null;
}

async function operationResult<T>(name: string, attempt = 1): Promise<T> {
  const operation = await checkOperation<T>(name);
  if (operation !== null) {
    return operation;
  }
  await delay(3000);
  if (attempt <= 5) {
    return await operationResult<T>(name, attempt + 1);
  }
  throw new OperationNotCompleteError();
}

export async function createProject({
  name,
  projectId,
}: {
  name: string;
  projectId: string;
}) {
  const resourcemanager = google.cloudresourcemanager("v1");

  const { data: operation } = await resourcemanager.projects.create({
    requestBody: {
      name,
      projectId,
      parent: { type: "folder", id: process.env.GCLOUD_PARENT_FOLDER_ID },
    },
    auth: await getAuth(),
  });

  if (typeof operation.name !== "string") {
    throw new InvalidOperationError();
  }

  return await operationResult<Schema$Project>(operation.name);
}

export async function updateBilling({
  projectId,
  billingAccountName,
}: {
  projectId: string;
  billingAccountName: string;
}) {
  const cloudbilling = google.cloudbilling("v1");
  await cloudbilling.projects.updateBillingInfo({
    name: `projects/${projectId}`,
    requestBody: {
      name: `projects/${projectId}/billingInfo`,
      projectId,
      billingAccountName,
      billingEnabled: true,
    },
    auth: await getAuth(["https://www.googleapis.com/auth/cloud-billing"]),
  });
}

export async function enableService({
  projectNumber,
  service,
}: {
  projectNumber: string;
  service: string;
}) {
  const serviceusage = google.serviceusage("v1");
  await serviceusage.services.enable({
    name: `projects/${projectNumber}/services/${service}`,
    auth: await getAuth(["https://www.googleapis.com/auth/service.management"]),
  });
}

export async function createApp({ projectId }: { projectId: string }) {
  const appengine = google.appengine("v1");
  await appengine.apps.create({
    requestBody: {
      id: projectId,
      locationId: "asia-south1",
    },
    auth: await getAuth(),
  });
}

export async function setupProject(
  name: string,
  projectId: string,
  replaceTakenId: (takenId: string) => Promise<string>
): Promise<cloudresourcemanager_v1.Schema$Project> {
  let project: cloudresourcemanager_v1.Schema$Project;

  try {
    project = await createProject({ name, projectId });
  } catch (e) {
    if (e.response?.data.error.status === "ALREADY_EXISTS") {
      const compromiseProjectId = await replaceTakenId(projectId);
      return setupProject(name, compromiseProjectId, replaceTakenId);
    }
    throw e;
  }

  if (
    typeof project.projectNumber !== "string" ||
    typeof project.projectId !== "string"
  ) {
    throw new InvalidProjectError();
  }

  await enableService({
    projectNumber: project.projectNumber,
    service: "cloudbilling.googleapis.com",
  });

  await updateBilling({
    projectId: project.projectId,
    billingAccountName: process.env.GCLOUD_BILLING_ACCOUNT as string,
  });

  await enableService({
    projectNumber: project.projectNumber,
    service: "appengine.googleapis.com",
  });

  await enableService({
    projectNumber: project.projectNumber,
    service: "cloudbuild.googleapis.com",
  });

  await createApp({ projectId: project.projectId });

  return project;
}
