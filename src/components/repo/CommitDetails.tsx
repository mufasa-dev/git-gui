export function CommitDetails(props: { commit: any }) {
  if (!props.commit && !props.commit.subject) {
    return <div class="p-4 text-gray-400">Selecione um commit</div>;
  }

  return (
    <div class="p-4 space-y-2">
      <div class="font-mono text-sm text-gray-600">{props.commit.hash}</div>
      <div>
        <b>{props.commit.subject}</b>
      </div>
      <div class="text-sm text-gray-500">
        {props.commit.authorName} ({props.commit.authorEmail}) – {props.commit.authorDate}
      </div>

      <div class="mt-2">
        <b>Arquivos alterados:</b>
        <ul class="ml-4 list-disc text-sm">
            {props.commit.files?.map((f: any) => (
                <li>
                {f.file} <span class="text-gray-400">{f.changes}</span>
                </li>
            ))}
        </ul>
      </div>
    </div>
  );
}
