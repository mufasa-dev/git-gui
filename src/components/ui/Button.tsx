import { JSX } from "solid-js";

type Props = {
    children: JSX.Element;
    class: string;
    disabled?: boolean;
    onClick: () => void;
};

export default function Button(props: Props) {
    return <button class={props.class} disabled={props.disabled} onClick={props.onClick}>
        {props.children}
    </button>
}