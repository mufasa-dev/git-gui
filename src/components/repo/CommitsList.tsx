import { Repo } from "../../models/Repo.model";

export default function CommitsList(props: {repo: Repo}) {
  return (
    <div>
      <h2>Commits for {props.repo.name}</h2>
      {/* Aqui você pode adicionar a lógica para listar os commits do repositório */}
      <p>Listagem de commits ainda não implementada.</p>
    </div>
  );

}