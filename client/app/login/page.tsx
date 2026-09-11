"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Lock,
  Eye,
  EyeOff,
  ShieldHalf,
  Scale,
  Loader2,
} from "lucide-react";

import { login } from "@/lib/api";
import AuthBackground from "@/components/AuthBackground";

export default function LoginPage() {
  const router = useRouter();

  const [userId, setUserId] = useState("");
  const [password, setPassword] =
    useState("");

  const [showPassword, setShowPassword] =
    useState(false);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  async function handleSubmit(
    e: React.FormEvent
  ) {
    e.preventDefault();

    setError("");

    if (!userId || !password) {
      setError(
        "Enter your user ID and password to continue."
      );
      return;
    }

    setLoading(true);

    try {
      const result = await login(
        userId,
        password
      );

      /*
       * The backend intentionally requires MFA
       * after successful password verification.
       */
      if (
        result.requiresMfa &&
        result.otpSent
      ) {
        router.push("/verify-mfa");
        return;
      }

      setError(
        "Authentication could not be completed. Please try again."
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Invalid credentials. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthBackground align="start">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-10 lg:flex-row lg:items-center lg:justify-between">
        {/* Left branding */}
        <motion.div
          initial={{
            opacity: 0,
            x: -16,
          }}
          animate={{
            opacity: 1,
            x: 0,
          }}
          transition={{
            duration: 0.5,
          }}
          className="flex max-w-sm flex-col items-center text-center text-white lg:items-start lg:text-left"
        >
          <motion.div
            initial={{
              scale: 0.7,
              opacity: 0,
            }}
            animate={{
              scale: 1,
              opacity: 1,
            }}
            transition={{
              duration: 0.4,
              delay: 0.1,
              type: "spring",
              stiffness: 200,
            }}
            className="rounded-full border border-white/25 bg-white/10 p-4"
          >
            <Scale size={28} />
          </motion.div>

          <h1 className="mt-5 text-2xl font-bold tracking-wide">
            SECURE DMS
          </h1>

          <p className="mt-2 text-base text-white/85">
            Secure Legal Document Management System
          </p>

          <p className="mt-3 text-sm tracking-wide text-white/60">
            Justice &middot; Integrity &middot; Accountability
          </p>
        </motion.div>

        {/* Right white card */}
        <motion.div
          initial={{
            opacity: 0,
            y: 16,
          }}
          animate={{
            opacity: 1,
            y: 0,
          }}
          transition={{
            duration: 0.45,
            ease: "easeOut",
            delay: 0.1,
          }}
          className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl"
        >
          <div className="flex flex-col items-center text-center">
            <div className="rounded-full bg-navy-900 p-3">
              <ShieldHalf
                className="text-white"
                size={22}
              />
            </div>

            <h2 className="mt-4 text-lg font-semibold text-ink-900">
              Authorized Access Only
            </h2>

            <p className="mt-1 text-sm text-ink-500">
              Please login with your credentials
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="mt-7 space-y-4"
          >
            <div>
              <label
                htmlFor="userId"
                className="mb-1 block text-sm font-medium text-ink-700"
              >
                User ID
              </label>

              <input
                id="userId"
                type="text"
                autoComplete="username"
                placeholder="Enter your User ID"
                value={userId}
                onChange={(e) =>
                  setUserId(
                    e.target.value
                  )
                }
                className="w-full rounded-lg border border-surface-border px-3 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 transition focus:border-navy-600 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1 block text-sm font-medium text-ink-700"
              >
                Password
              </label>

              <div className="relative">
                <input
                  id="password"
                  type={
                    showPassword
                      ? "text"
                      : "password"
                  }
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) =>
                    setPassword(
                      e.target.value
                    )
                  }
                  className="w-full rounded-lg border border-surface-border px-3 py-2.5 pr-10 text-sm text-ink-900 placeholder:text-ink-400 transition focus:border-navy-600 focus:outline-none"
                />

                <button
                  type="button"
                  onClick={() =>
                    setShowPassword(
                      (v) => !v
                    )
                  }
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-500 hover:text-ink-900"
                  aria-label={
                    showPassword
                      ? "Hide password"
                      : "Show password"
                  }
                >
                  {showPassword ? (
                    <EyeOff size={18} />
                  ) : (
                    <Eye size={18} />
                  )}
                </button>
              </div>
            </div>

            <div className="flex justify-end text-sm">
              <button
                type="button"
                onClick={() =>
                  setError(
                    "Password resets are handled by your administrator."
                  )
                }
                className="font-medium text-navy-700 hover:underline"
              >
                Forgot Password?
              </button>
            </div>

            {error && (
              <motion.p
                initial={{
                  opacity: 0,
                  y: -4,
                }}
                animate={{
                  opacity: 1,
                  y: 0,
                }}
                role="alert"
                className="rounded-lg bg-status-criticalBg px-3 py-2 text-sm text-status-critical"
              >
                {error}
              </motion.p>
            )}

            <motion.button
              whileHover={{
                scale: 1.01,
              }}
              whileTap={{
                scale: 0.98,
              }}
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-navy-800 py-2.5 text-sm font-medium text-white transition hover:bg-navy-700 disabled:opacity-60"
            >
              {loading ? (
                <Loader2
                  className="animate-spin"
                  size={16}
                />
              ) : (
                <Lock size={16} />
              )}

              Secure Login
            </motion.button>
          </form>

          <p className="mt-6 text-center text-xs text-ink-400">
            Authorized users only. Accounts are provisioned by an administrator — there is no public registration.
          </p>
        </motion.div>
      </div>
    </AuthBackground>
  );
}