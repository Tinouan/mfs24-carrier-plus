/**
 * AuthService - DEPRECATED
 *
 * @deprecated This service is no longer used. P2P mode uses InitService for local auth.
 * Kept for reference only - will be removed in future cleanup.
 *
 * Use instead: import { InitService } from "./services"
 */

import { api, ENDPOINTS } from "./api";
import type { UserInfo } from "../types";

// ═══════════════════════════════════════════════════════════
// RESPONSE TYPES
// ═══════════════════════════════════════════════════════════

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
}

export interface UserProfileResponse {
  id: number;
  username: string;
  email: string;
  wallet_balance?: number;
  xp?: number;
  level?: number;
  created_at?: string;
}

// ═══════════════════════════════════════════════════════════
// AUTH SERVICE CLASS
// ═══════════════════════════════════════════════════════════

class AuthService {
  private readonly STORAGE_KEY_EMAIL = "carrier_plus_email";
  private readonly STORAGE_KEY_PASSWORD = "carrier_plus_password";
  private readonly STORAGE_KEY_TOKEN = "carrier_plus_token";

  /**
   * Login with username/email and password
   */
  async login(username: string, password: string): Promise<{ token: string; user: UserInfo }> {
    // FastAPI OAuth2 expects form data for login
    const formData = new URLSearchParams();
    formData.append("username", username);
    formData.append("password", password);

    const response = await fetch(`${api["baseUrl"]}${ENDPOINTS.LOGIN}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: "Login failed" }));
      throw new Error(error.detail || "Login failed");
    }

    const data = await response.json() as LoginResponse;
    const token = data.access_token;

    // Fetch user profile
    const user = await this.getCurrentUser(token);

    return { token, user };
  }

  /**
   * Get current user profile
   */
  async getCurrentUser(token: string): Promise<UserInfo> {
    const response = await api.get<UserProfileResponse>("/users/me", token);
    if (response.success && response.data) {
      return {
        id: response.data.id,
        username: response.data.username,
        email: response.data.email,
      };
    }
    throw new Error(response.error || "Failed to fetch user profile");
  }

  /**
   * Get user wallet balance
   */
  async getWalletBalance(token: string): Promise<number> {
    const response = await api.get<UserProfileResponse>("/users/me", token);
    if (response.success && response.data) {
      return response.data.wallet_balance || 0;
    }
    throw new Error(response.error || "Failed to fetch wallet balance");
  }

  /**
   * Save credentials to local storage (encrypted in production)
   */
  saveCredentials(email: string, password: string): void {
    try {
      localStorage.setItem(this.STORAGE_KEY_EMAIL, email);
      localStorage.setItem(this.STORAGE_KEY_PASSWORD, password);
    } catch (error) {
      console.warn("[Auth] Failed to save credentials:", error);
    }
  }

  /**
   * Load credentials from local storage
   */
  loadCredentials(): { email: string; password: string } | null {
    try {
      const email = localStorage.getItem(this.STORAGE_KEY_EMAIL);
      const password = localStorage.getItem(this.STORAGE_KEY_PASSWORD);
      if (email && password) {
        return { email, password };
      }
    } catch (error) {
      console.warn("[Auth] Failed to load credentials:", error);
    }
    return null;
  }

  /**
   * Save token to local storage
   */
  saveToken(token: string): void {
    try {
      localStorage.setItem(this.STORAGE_KEY_TOKEN, token);
    } catch (error) {
      console.warn("[Auth] Failed to save token:", error);
    }
  }

  /**
   * Load token from local storage
   */
  loadToken(): string | null {
    try {
      return localStorage.getItem(this.STORAGE_KEY_TOKEN);
    } catch (error) {
      console.warn("[Auth] Failed to load token:", error);
    }
    return null;
  }

  /**
   * Clear all stored auth data
   */
  clearAuth(): void {
    try {
      localStorage.removeItem(this.STORAGE_KEY_EMAIL);
      localStorage.removeItem(this.STORAGE_KEY_PASSWORD);
      localStorage.removeItem(this.STORAGE_KEY_TOKEN);
    } catch (error) {
      console.warn("[Auth] Failed to clear auth:", error);
    }
  }

  /**
   * Check if user has saved credentials
   */
  hasSavedCredentials(): boolean {
    const creds = this.loadCredentials();
    return creds !== null;
  }
}

// ═══════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════

export const authService = new AuthService();
