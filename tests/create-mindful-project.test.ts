import cmpr from "../src/create-mindful-project";

test(
  "it does things",
  async () => {
    const {
      NPM_TOKEN,
      VERCEL_ORG_ID,
      VERCEL_TOKEN,
      GOOGLE_APPLICATION_CREDENTIALS,
    } = process.env as { [key: string]: string };

    console.log(
      NPM_TOKEN,
      VERCEL_ORG_ID,
      VERCEL_TOKEN,
      GOOGLE_APPLICATION_CREDENTIALS
    );

    await cmpr({
      domain: "mindfulstudio.io",
      npmToken: NPM_TOKEN,
      projectHid: "ms-web",
      projectName: "MS Web",
      vercelOrgId: VERCEL_ORG_ID,
      vercelToken: VERCEL_TOKEN,
      mongoPassword: "passwwdd",
      gcloudCredentialsFile: GOOGLE_APPLICATION_CREDENTIALS,
    });

    expect(true).toBe(true);
  },
  1000 * 60
);
