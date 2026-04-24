import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { User } from "../api/client";

interface AuthState {
  user: User | null;
  token: string | null;
}

const STORAGE_KEY = "campaign-manager-auth";

function loadState(): AuthState {
  if (typeof window === "undefined") return { user: null, token: null };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { user: null, token: null };
    const parsed = JSON.parse(raw) as AuthState;
    if (parsed && typeof parsed === "object" && parsed.token) return parsed;
    return { user: null, token: null };
  } catch {
    return { user: null, token: null };
  }
}

function persistState(state: AuthState) {
  if (typeof window === "undefined") return;
  try {
    if (state.token) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // localStorage may be unavailable (private mode, quota); ignore
  }
}

const initialState: AuthState = loadState();

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setCredentials(state, action: PayloadAction<{ user: User; token: string }>) {
      state.user = action.payload.user;
      state.token = action.payload.token;
      persistState(state);
    },
    logout(state) {
      state.user = null;
      state.token = null;
      persistState(state);
    },
  },
});

export const { setCredentials, logout } = authSlice.actions;
export default authSlice.reducer;
