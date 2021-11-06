import Frame from "../layouts/Frame";
import ProjectTitle from "../components/ProjectTitle";

export type Props = {
  projectName: string;
};

function IndexPage({ projectName }: Props) {
  return (
    <Frame>
      <ProjectTitle projectName={projectName} />
    </Frame>
  );
}

export default IndexPage;
