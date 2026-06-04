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
      if (!src || !src.includes("dev.azure.com")) {
        return src;
      }

      try {
        const base64Data = await azureService.getAvatarBase64(src);

        if (!base64Data || base64Data.length < 2000) {
          if (email) {
            return getGravatarUrl(email, 120);
          }
        }

        return base64Data;
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
        <div class={`bg-blue-600 flex items-center justify-center text-white font-bold rounded-full select-none text-xs ${props.class}`} onClick={() => props.onClick && props.onClick()}>
          {props.fallbackName ? props.fallbackName.substring(0, 2).toUpperCase() : "PR"}
        </div>
      }
    >
      <img 
        onClick={() => props.onClick && props.onClick()}
        src={avatarUrl()} 
        class={`${props.class} object-cover rounded-full`} 
        alt={props.alt || "Avatar"} 
      />
    </Show>
  );
}