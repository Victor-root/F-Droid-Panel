import { ActivityPage } from "../ActivityPage";
import { useRepositoryId } from "./RepositoryLayout";

export function RepositoryActivity() {
  return <ActivityPage repositoryId={useRepositoryId()} />;
}
