import { ProjectCardStack, type ProjectCardItem } from "@/components/ProjectCardStack";
import ProjectCardA from "@/components/project-cards/ProjectCardA";
import ProjectCardB from "@/components/project-cards/ProjectCardB";
import ProjectCardC from "@/components/project-cards/ProjectCardC";

const projectCards: ProjectCardItem[] = [
  {
    id: "attegi",
    label: "Attegi project card",
    content: <ProjectCardA />,
  },
  {
    id: "mirrored",
    label: "Mirrored project card",
    content: <ProjectCardB />,
  },
  {
    id: "ogis",
    label: "ogis project card",
    content: <ProjectCardC />,
  },
];

export default function ProjectStackShowcase() {
  return <ProjectCardStack cards={projectCards} />;
}
