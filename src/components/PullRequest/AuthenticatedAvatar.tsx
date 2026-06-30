import { createResource, Show } from "solid-js";
import { azureService } from "../../services/azure";
import { getGravatarUrl } from "../../services/gravatarService";

interface AvatarProps {
    src: string;
    email?: string;
    alt?: string;
    class?: string;
    fallbackName?: string;
    onClick?: () => void;
}

export default function AuthenticatedAvatar(props: AvatarProps) {
  const [avatarUrl] = createResource(
    () => ({ src: props.src, email: props.email }),
    async ({ src, email }) => {
      if (!src) return "";

      // 1. Se não for uma URL do Azure, não precisa passar pelo fluxo de fetch ou cache
      if (!src.includes("dev.azure.com")) {
        return src;
      }

      // 2. Chave única de cache baseada na URL original do Azure
      const cacheKey = `avatar:${src}`;
      const cachedData = sessionStorage.getItem(cacheKey);

      if (cachedData) {
        return cachedData; // Retorna instantaneamente do sessionStorage
      }

      try {
        const base64Data = await azureService.getAvatarBase64(src);

        let finalUrl = base64Data;

        // Se o Azure retornar um avatar vazio/inválido, tenta o Gravatar
        if (!base64Data || base64Data.length < 2000) {
          if (email) {
            finalUrl = getGravatarUrl(email, 120);
          }
        }

        // 3. Se obtivemos um resultado válido, salvamos no sessionStorage para a próxima vez
        if (finalUrl) {
          sessionStorage.setItem(cacheKey, finalUrl);
        }

        return finalUrl;
      } catch (error) {
        console.error("Erro no ciclo do componente de avatar:", error);
        return "";
      }
    }
  );

  return (
    <Show 
      when={avatarUrl() && !avatarUrl.error && avatarUrl() !== ""} 
      fallback={
        <div 
          class={`bg-blue-600 flex items-center justify-center text-white font-bold rounded-full select-none text-xs cursor-pointer ${props.class}`} 
          onClick={() => props.onClick && props.onClick()}
        >
          {props.fallbackName ? props.fallbackName.substring(0, 2).toUpperCase() : "PR"}
        </div>
      }
    >
      <img 
        onClick={() => props.onClick && props.onClick()}
        src={avatarUrl()} 
        class={`${props.class} object-cover rounded-full cursor-pointer`} 
        alt={props.alt || "Avatar"} 
      />
    </Show>
  );
}