import Head from "next/head";
import { IndexPage } from "@mindfulstudio/{{projectHid}}-ui";
import { gql } from "@apollo/client";
import { Project } from "@mindfulstudio/{{projectHid}}-types";
import { GetStaticProps, InferGetStaticPropsType } from "next";
import { client } from "./_app";

type ProjectData = {
  project: Project;
};

const PROJECT = gql`
  query ProjectQuery {
    project {
      name
    }
  }
`;

export default function Home({
  project,
}: InferGetStaticPropsType<typeof getStaticProps>) {
  return (
    <div>
      <Head>
        <title>Mindful Studio Project</title>
        <link rel="icon" href="/favicon.ico" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/reset-css@5.0.1/reset.css"
        />
      </Head>
      <IndexPage projectName={project.name} />
    </div>
  );
}

export const getStaticProps: GetStaticProps = async () => {
  const { data } = await client.query<ProjectData>({
    query: PROJECT,
  });

  return { props: data };
};
