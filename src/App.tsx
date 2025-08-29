import RepositoryPage from "./pages/RepositoryPage";
import "./index.css";

export default function App() {

  if (localStorage.theme === "dark") {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
}

  return (
    <div class="h-screen w-screen flex flex-col">
      <RepositoryPage />
    </div>
  );
}
