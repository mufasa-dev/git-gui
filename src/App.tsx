import RepositoryPage from "./pages/RepositoryPage";
import "./index.css";
import { Toaster } from "solid-toast";
import { LoadingProvider } from "./components/ui/LoadingContext";

export default function App() {

  if (localStorage.theme === "dark") {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
}

  return (
    <div class="h-screen w-screen flex flex-col">
      <Toaster position="bottom-right" gutter={8} />
      <LoadingProvider>
        <RepositoryPage />
      </LoadingProvider>
    </div>
  );
}
