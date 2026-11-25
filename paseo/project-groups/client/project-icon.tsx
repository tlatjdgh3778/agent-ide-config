import { useProject, useRpc, type ProjectRef } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/ui";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Image } from "react-native";
import { projectIconRpc } from "../shared/rpc";
import { DecorIcon } from "./decor";

/** A plugin override wins; otherwise use the project's own icon, then the folder fallback. */
export function ProjectIcon({
  reference,
  icon,
  color,
  size,
}: {
  reference: ProjectRef;
  icon: string | null;
  color: string;
  size: number;
}) {
  const revision = useProject(reference, (project) => project.iconRevision);
  const readIcon = useRpc(projectIconRpc);
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["project-groups", "project-icon", reference.hostId, reference.id, revision],
    queryFn: () => readIcon({ hostId: reference.hostId, projectId: reference.id }),
    enabled: !icon,
    staleTime: Infinity,
    // A read can fail while the plugin is starting or reloading; try again before falling back.
    retry: 2,
    retryDelay: (attempt) => 1000 * 2 ** attempt,
  });
  const fallback = <DecorIcon icon={icon} fallback="Folder" color={color} size={size} />;
  if (icon || !query.data?.icon) return fallback;
  const projectIcon = query.data.icon;
  if (projectIcon.kind === "svg") return <Icon icon={{ svg: projectIcon.svg }} color={color} size={size} />;
  if (failedUri === projectIcon.uri) return fallback;
  return (
    <Image
      accessible={false}
      source={{ uri: projectIcon.uri }}
      resizeMode="contain"
      style={{ width: size, height: size }}
      onError={() => setFailedUri(projectIcon.uri)}
    />
  );
}
