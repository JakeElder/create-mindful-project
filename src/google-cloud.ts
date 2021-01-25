import { cloudresourcemanager_v1, google } from "googleapis";

export async function createProject({
  name,
  projectId,
}: {
  name: string;
  projectId: string;
}) {
  const resourcemanager = google.cloudresourcemanager("v1");
  await resourcemanager.projects.create({
    requestBody: { name, projectId },
    auth: await getAuth(["https://www.googleapis.com/auth/cloud-platform"]),
  });
  const { data } = await resourcemanager.projects.get({
    projectId,
    auth: await getAuth(["https://www.googleapis.com/auth/cloud-platform"]),
  });
  return data;
}

export async function enableAppEngineService({
  projectNumber,
}: {
  projectNumber: string;
}) {
  const serviceusage = google.serviceusage("v1");
  await serviceusage.services.enable({
    name: `projects/${projectNumber}/services/appengine.googleapis.com`,
    auth: await getAuth([
      "https://www.googleapis.com/auth/cloud-platform",
      "https://www.googleapis.com/auth/service.management",
    ]),
  });
}

export async function createApp({ projectId }: { projectId: string }) {
  const appengine = google.appengine("v1");
  await appengine.apps.create({
    requestBody: {
      id: projectId,
      locationId: "asia-south1",
    },
    auth: await getAuth(["https://www.googleapis.com/auth/cloud-platform"]),
  });
}

export async function getAuth(scopes: string[]) {
  const auth = new google.auth.GoogleAuth({
    scopes,
    projectId: "mindful-studio-cli",
  });
  return await auth.getClient();
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

  await createApp({ projectId: project.projectId as string });

  return project;
}
