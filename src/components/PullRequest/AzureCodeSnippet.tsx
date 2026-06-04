import { createResource, Show } from "solid-js";
import CodePreviewer from "../ui/CodePreviewer";

interface CodeSnippetProps {
    filePath: string;
    startLine: number;
    endLine: number;
    azureService: any;
    organization: string;
    repoName: string;
    sourceVersion: string;
}

export function AzureCodeSnippet(props: CodeSnippetProps) {
    const [fileContent] = createResource(
        () => ({
            version: props.sourceVersion,
            path: props.filePath
        }),
        async ({ version, path }) => {
            if (!version || version === "main" || !path) return "";
            
            return await props.azureService.getFileContent(
                props.organization,
                props.repoName,
                path,
                version
            );
        }
    );

    return (
        <Show 
            when={!fileContent.loading} 
            fallback={<div class="p-3 text-xs text-gray-400 animate-pulse font-mono">Buscando trecho do código...</div>}
        >
            <Show when={fileContent()}>
                <div class="mt-2 max-h-60 overflow-y-auto border border-gray-200 dark:border-gray-700/60 rounded-md shadow-sm">
                    <CodePreviewer 
                        content={fileContent()} 
                        fileName={props.filePath.split('/').pop() || 'file.txt'} 
                    />
                </div>
            </Show>
        </Show>
    );
}