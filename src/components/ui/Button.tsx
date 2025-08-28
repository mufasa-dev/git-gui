import { JSX } from "solid-js";

type Props = {
    children: JSX.Element;
    class: string;
    onClick: () => void;
};

export default function Button(props: Props) {
    return <button class={props.class} onClick={props.onClick}>
        {props.children}
    </button>
}