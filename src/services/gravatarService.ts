import md5 from "md5";
import { fetch } from '@tauri-apps/plugin-http';

export function getGravatarUrl(email: string, size = 64) {
  const hash = md5(email.trim().toLowerCase());
  return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=identicon`;
}

export async function getGravatarProfile(email: string) {
  if (!email) return null;
  const hash = md5(email.trim().toLowerCase());
  
  try {
    // O fetch do Tauri não sofre bloqueio de CORS
    const response = await fetch(`https://www.gravatar.com/${hash}.json`, {
      method: 'GET',
      connectTimeout: 5000
    });

    if (!response.ok) return null;

    const data = await response.json() as any;
    return data.entry[0];
  } catch (error) {
    console.error("Erro via Tauri Fetch:", error);
    return null;
  }
}