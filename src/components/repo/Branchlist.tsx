type Props = {
  branches: string[];
};

export default function BranchList(props: Props) {
  return (
    <ul class="mt-2 space-y-1">
      {props.branches.map((branch) => {
        const active = branch.startsWith("*");
        const name = branch.replace("*", "").trim();

        return (
          <li class={active ? "font-bold text-green-600" : ""}>
            {name}
          </li>
        );
      })}
    </ul>
  );
}
