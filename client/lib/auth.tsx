"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import type { User } from "./types";

import {
  clearAuthStorage,
  getCurrentUser,
} from "./api";

interface AuthContextValue {
  user: User | null;
  setUser: (user: User | null) => void;
  loading: boolean;
}

const AuthContext =
  createContext<AuthContextValue>({
    user: null,
    setUser: () => {},
    loading: true,
  });

const SESSION_USER_KEY =
  "secure-dms-user-session";

export function AuthProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [user, setUserState] =
    useState<User | null>(null);

  const [loading, setLoading] =
    useState(true);

  /*
   * Restore the authenticated session when the application starts.
   */
  useEffect(() => {
    let mounted = true;

    async function restoreSession() {
      try {
        const currentUser =
          await getCurrentUser();

        if (!mounted) {
          return;
        }

        if (currentUser) {
          setUserState(currentUser);

          sessionStorage.setItem(
            SESSION_USER_KEY,
            JSON.stringify(currentUser)
          );
        } else {
          setUserState(null);

          sessionStorage.removeItem(
            SESSION_USER_KEY
          );
        }
      } catch (error) {
        console.error(
          "Unable to restore authentication session:",
          error
        );

        if (mounted) {
          setUserState(null);

          clearAuthStorage();

          sessionStorage.removeItem(
            SESSION_USER_KEY
          );
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    restoreSession();

    return () => {
      mounted = false;
    };
  }, []);

  /*
   * Update the current authenticated user.
   */
  function setUser(
    nextUser: User | null
  ) {
    setUserState(nextUser);

    if (
      typeof window === "undefined"
    ) {
      return;
    }

    if (nextUser) {
      sessionStorage.setItem(
        SESSION_USER_KEY,
        JSON.stringify(nextUser)
      );
    } else {
      sessionStorage.removeItem(
        SESSION_USER_KEY
      );

      clearAuthStorage();
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        setUser,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(
    AuthContext
  );
}