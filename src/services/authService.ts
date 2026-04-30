import { invoke } from "@tauri-apps/api/core";

// Tipagem para as respostas do Rust
export interface AuthResponse {
  access_token?: string;
  error_description?: string;
}

export interface RegisterParams {
  email: string;
  password: string;
  full_name: string;
}

export interface LoginParams {
  email: string;
  password: string;
}

export const authService = {
  async login({ email, password }: LoginParams): Promise<AuthResponse> {
    try {
      // O Tauri retorna o Result::Err do Rust como uma exceção (throw) no JS
      return await invoke<AuthResponse>("login_with_supabase", { 
        email, 
        password 
      });
    } catch (error) {
      throw error; // Repassa o erro (string) vindo do Rust
    }
  },

  async register({ email, password, full_name }: RegisterParams): Promise<AuthResponse> {
    try {
      return await invoke<AuthResponse>("register_with_supabase", { 
        email, 
        password, 
        full_name 
      });
    } catch (error) {
      throw error;
    }
  },

  logout() {
    localStorage.removeItem("brook_token");
  },

  getToken(): string | null {
    return localStorage.getItem("brook_token");
  }
};