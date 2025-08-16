import { JSX } from "solid-js";

type Props = {
    children: JSX.Element;
    onClick: () => void;
};

export default function Button(props: Props) {
    return <button class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700" onClick={props.onClick}>
        {props.children}
    </button>
}