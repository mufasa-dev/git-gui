import { getGravatarUrl } from "../../services/gravatarService";
import { formatDate } from "../../utils/date";

export function CommitDetails(props: { commit: any}) {

  return (
    <div class="p-4 space-y-2">
      {!props.commit ? (
        <div class="text-gray-400">Selecione um commit</div>
      ) : (
        <>
          <div class="flex">
            <img
              src={getGravatarUrl(props.commit.authorEmail, 80)}
              alt={props.commit.authorName}
              class="w-[60px] h-[60px] rounded flex-2"
            />
            <div class="flex-1 ml-4">
              <b>{props.commit.authorName}</b> 
              <span class="text-gray-500 dark:text-gray-200 text-sm ml-2">{props.commit.authorEmail}</span> <br />
              <span class="text-gray-500 dark:text-gray-400 text-sm">{formatDate(props.commit.authorDate)}</span>
            </div>
          </div>

          <div class="flex items-center">
            <div class="w-[60px] text-right">SHA</div>
            <div class="font-mono text-sm text-gray-600 dark:text-gray-200 ml-4">{props.commit.hash}</div>
          </div>

          {
            props.commit?.parents?.length > 0 && <div class="flex items-center">
              <div class="w-[60px] text-right">Parents</div>
              <div class="font-mono text-sm text-gray-600 dark:text-gray-200 ml-4">{props.commit.parents}</div>
            </div>
          }

          <hr />

          <div class="flex">
            <div class="w-[60px]"></div>
            <div class="ml-4">
              <b>{props.commit.subject}</b> <br />
              <p class="whitespace-pre-wrap mt-2 text-sm text-gray-500 dark:text-gray-400">{props.commit.body}</p>
            </div>
          </div>

          <hr />

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
        </>
        )}
    </div>
  );
}
