type Props = {
    diff: string
    class: string;
    disabled?: boolean;
};

export default function DiffViewer(props: Props) {
    return (
         <pre class="p-4 overflow-auto text-sm whitespace-pre-wrap">
            {props.diff.split("\n").map(line => (
                <div
                class={
                    line.startsWith("+") ? "bg-green-300" :
                    line.startsWith("-") ? "bg-red-300" :
                    "text-black"
                }
                >
                {line}
                </div>
            ))}
        </pre>
    );
}