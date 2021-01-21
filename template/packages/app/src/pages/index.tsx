import React from "react";
import Head from "next/head";
import { IndexPage } from "@mindfulstudio/project-eden-ui";
import { gql, useQuery } from "@apollo/client";
import { Project } from "@mindfulstudio/project-eden-types";

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

export default function Home() {
  const { loading, error, data } = useQuery<ProjectData>(PROJECT);

  if (loading) {
    return <span>Loading.</span>;
  }

  if (error) {
    return <pre>{JSON.stringify(error, null, 2)}</pre>;
  }

  const { project } = data!;

  return (
    <div>
      <Head>
        <title>Mindful Studio Project</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <IndexPage projectName={project.name} />
    </div>
  );
}
