"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ShieldCheck,
  ArrowLeft,
  Loader2,
  Shield,
} from "lucide-react";

import {
  MFA_IDENTIFIER_KEY,
  verifyMfaCode,
} from "@/lib/api";

import { useAuth } from "@/lib/auth";
import AuthBackground from "@/components/AuthBackground";

const CODE_LENGTH = 6;
const RESEND_SECONDS = 90;

export default function VerifyMfaPage() {
  const router = useRouter();
  const { setUser } = useAuth();

  const [digits, setDigits] =
    useState<string[]>(
      Array(CODE_LENGTH).fill("")
    );

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const [secondsLeft, setSecondsLeft] =
    useState(RESEND_SECONDS);

  const [
    identifier,
    setIdentifier,
  ] = useState("");

  const inputsRef =
    useRef<(HTMLInputElement | null)[]>(
      []
    );

  /*
   * Make sure the user actually arrived here
   * after a successful password step.
   */
  useEffect(() => {
    const storedIdentifier =
      sessionStorage.getItem(
        MFA_IDENTIFIER_KEY
      );

    if (!storedIdentifier) {
      router.replace("/login");
      return;
    }

    setIdentifier(
      storedIdentifier
    );
  }, [router]);

  /*
   * Countdown timer.
   */
  useEffect(() => {
    if (secondsLeft <= 0) {
      return;
    }

    const timer = setTimeout(
      () =>
        setSecondsLeft(
          (seconds) =>
            seconds - 1
        ),
      1000
    );

    return () =>
      clearTimeout(timer);
  }, [secondsLeft]);

  /*
   * Handle individual OTP digit.
   */
  function handleChange(
    index: number,
    value: string
  ) {
    if (!/^[0-9]?$/.test(value)) {
      return;
    }

    const next = [...digits];

    next[index] = value;

    setDigits(next);
    setError("");

    if (
      value &&
      index < CODE_LENGTH - 1
    ) {
      inputsRef.current[
        index + 1
      ]?.focus();
    }
  }

  /*
   * Handle backspace navigation.
   */
  function handleKeyDown(
    index: number,
    event: React.KeyboardEvent<HTMLInputElement>
  ) {
    if (
      event.key === "Backspace" &&
      !digits[index] &&
      index > 0
    ) {
      inputsRef.current[
        index - 1
      ]?.focus();
    }
  }

  /*
   * Also support pasting all 6 digits.
   */
  function handlePaste(
    event: React.ClipboardEvent<HTMLInputElement>
  ) {
    event.preventDefault();

    const pasted =
      event.clipboardData
        .getData("text")
        .replace(/\D/g, "")
        .slice(0, CODE_LENGTH);

    if (!pasted) {
      return;
    }

    const next =
      Array(CODE_LENGTH).fill("");

    pasted
      .split("")
      .forEach(
        (digit, index) => {
          next[index] = digit;
        }
      );

    setDigits(next);
    setError("");

    const focusIndex = Math.min(
      pasted.length,
      CODE_LENGTH - 1
    );

    inputsRef.current[
      focusIndex
    ]?.focus();
  }

  /*
   * Verify the OTP using the real backend.
   */
  async function handleVerify() {
    setError("");

    const code =
      digits.join("");

    if (
      code.length !== CODE_LENGTH
    ) {
      setError(
        "Enter the full 6-digit code."
      );
      return;
    }

    if (!identifier) {
      setError(
        "Your login session has expired. Please log in again."
      );
      return;
    }

    setLoading(true);

    try {
      const { user } =
        await verifyMfaCode(
          code
        );

      /*
       * Store the authenticated user
       * in the frontend auth context.
       */
      setUser(user);

      /*
       * MFA is complete.
       * The JWT tokens have already been
       * stored by verifyMfaCode().
       */
      router.replace(
        "/dashboard"
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "That code didn't work. Try again."
      );

      setDigits(
        Array(CODE_LENGTH).fill("")
      );

      /*
       * Put the cursor back into the
       * first OTP field.
       */
      setTimeout(() => {
        inputsRef.current[0]?.focus();
      }, 0);
    } finally {
      setLoading(false);
    }
  }

  const mm =
    Math.floor(
      secondsLeft / 60
    );

  const ss =
    (secondsLeft % 60)
      .toString()
      .padStart(2, "0");

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
          <div className="mb-3 flex items-center gap-2 text-white/80">
            <ShieldCheck
              size={20}
            />

            <span className="text-sm font-semibold tracking-wide">
              SECURE DMS
            </span>
          </div>

          <h1 className="mt-3 text-2xl font-bold leading-snug">
            Stronger Security for a Safer Justice System
          </h1>

          <p className="mt-3 text-sm text-white/70">
            Multi-factor authentication is
            required for every login —
            every access attempt is recorded
            to the audit ledger, successful
            or not.
          </p>

          <Shield
            size={54}
            className="mt-8 hidden text-white/25 lg:block"
          />
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
          <button
            type="button"
            onClick={() =>
              router.push(
                "/login"
              )
            }
            className="mb-4 flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900"
          >
            <ArrowLeft
              size={14}
            />

            Back to Login
          </button>

          <div className="flex flex-col items-center text-center">
            <div className="rounded-full bg-navy-900 p-3">
              <ShieldCheck
                className="text-white"
                size={22}
              />
            </div>

            <h2 className="mt-4 text-lg font-semibold text-ink-900">
              Verify Your Identity
            </h2>

            <p className="mt-1 text-sm text-ink-500">
              A verification code has been sent
              to your registered device.
            </p>

            {identifier && (
              <p className="mt-2 text-xs text-ink-400">
                User: {identifier}
              </p>
            )}
          </div>

          {/* OTP inputs */}
          <div className="mt-7 flex justify-center gap-2">
            {digits.map(
              (
                digit,
                index
              ) => (
                <input
                  key={index}
                  ref={(element) => {
                    inputsRef.current[
                      index
                    ] = element;
                  }}
                  value={digit}
                  onChange={(event) =>
                    handleChange(
                      index,
                      event.target.value
                    )
                  }
                  onKeyDown={(event) =>
                    handleKeyDown(
                      index,
                      event
                    )
                  }
                  onPaste={
                    index === 0
                      ? handlePaste
                      : undefined
                  }
                  inputMode="numeric"
                  autoComplete={
                    index === 0
                      ? "one-time-code"
                      : "off"
                  }
                  maxLength={1}
                  aria-label={`Digit ${
                    index + 1
                  }`}
                  disabled={loading}
                  className="h-12 w-11 rounded-lg border border-surface-border text-center text-lg font-semibold text-ink-900 transition focus:border-navy-600 focus:outline-none disabled:bg-gray-100"
                />
              )
            )}
          </div>

          {/* Error */}
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
              className="mt-4 rounded-lg bg-status-criticalBg px-3 py-2 text-center text-sm text-status-critical"
            >
              {error}
            </motion.p>
          )}

          {/* Verify button */}
          <motion.button
            whileHover={{
              scale: 1.01,
            }}
            whileTap={{
              scale: 0.98,
            }}
            type="button"
            onClick={
              handleVerify
            }
            disabled={
              loading ||
              !identifier
            }
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-navy-800 py-2.5 text-sm font-medium text-white transition hover:bg-navy-700 disabled:opacity-60"
          >
            {loading && (
              <Loader2
                className="animate-spin"
                size={16}
              />
            )}

            Verify
          </motion.button>

          {/* Countdown */}
          <p className="mt-4 text-center text-sm text-ink-500">
            {secondsLeft > 0 ? (
              `Resend code in ${mm}:${ss}`
            ) : (
              <button
                type="button"
                className="font-medium text-navy-700 hover:underline"
                onClick={() =>
                  router.push(
                    "/login"
                  )
                }
              >
                Return to Login
              </button>
            )}
          </p>
        </motion.div>
      </div>
    </AuthBackground>
  );
}