"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ShieldHalf,
  Lock,
  Fingerprint,
  Link2,
  History,
  KeyRound,
  Radar,
  ArrowRight,
} from "lucide-react";

const DIFFERENTIATORS = [
  { Icon: Lock, title: "Case + Document Authorization", body: "Access is scoped by role, case assignment and document sensitivity — never just a login." },
  { Icon: History, title: "Cryptographic Chain of Custody", body: "Every view, edit and download is linked into an unbroken, ordered custody trail." },
  { Icon: Fingerprint, title: "SHA-256 Tamper Detection", body: "Every document is fingerprinted. Any unauthorized change is caught instantly." },
  { Icon: Link2, title: "Permissioned Blockchain Audit", body: "A tamper-evident ledger of activity — not a cryptocurrency, a proof mechanism." },
  { Icon: Radar, title: "Centralized Security Monitoring", body: "Encryption, TEE operations and access control status, visible at a glance." },
  { Icon: KeyRound, title: "Controlled Emergency Access", body: "Time-boxed, reason-logged, admin-approved access — with automatic expiry." },
];

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: i * 0.07, ease: "easeOut" },
  }),
};

export default function LandingPage() {
  return (
    <main
      className="relative min-h-screen overflow-hidden text-white"
      style={{
        backgroundImage: "url('/images/justice-bg.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        backgroundAttachment: "fixed",
      }}
    >
      <div className="absolute inset-0 bg-navy-950/45" />
      <div className="absolute inset-0 bg-gradient-to-b from-navy-950/30 via-navy-950/30 to-navy-950/60" />

      <div className="relative z-10 mx-auto max-w-5xl px-6 py-20">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex items-center gap-2 text-white/80"
        >
          <ShieldHalf size={22} />
          <span className="text-sm font-semibold tracking-wide">SECURE DMS</span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="mt-10 max-w-3xl text-4xl font-semibold leading-tight sm:text-5xl"
        >
          Secure document lifecycle management for legal & investigation records.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mt-6 max-w-2xl text-lg text-white/70"
        >
          ICJS connects the justice ecosystem — <span className="text-white">Secure DMS secures the documents flowing through it.</span>{" "}
          Case-level authorization, encrypted storage, SHA-256 integrity verification and a tamper-evident audit ledger, in one system.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-10 flex flex-wrap items-center gap-4"
        >
          <Link
            href="/login"
            className="group flex items-center gap-2 rounded-lg bg-white px-6 py-3 text-sm font-semibold text-navy-950 transition hover:bg-white/90"
          >
            Access System
            <ArrowRight size={16} className="transition group-hover:translate-x-0.5" />
          </Link>
          <span className="text-sm text-white/50">Authorized personnel only — accounts are provisioned by an administrator.</span>
        </motion.div>

        <div className="mt-24 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {DIFFERENTIATORS.map((d, i) => (
            <motion.div
              key={d.title}
              custom={i}
              variants={fadeUp}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: "-60px" }}
              className="rounded-card border border-white/10 bg-white/5 p-5 backdrop-blur-sm"
            >
              <div className="mb-3 inline-flex rounded-lg bg-white/10 p-2 text-white">
                <d.Icon size={18} />
              </div>
              <h3 className="text-sm font-semibold text-white">{d.title}</h3>
              <p className="mt-1.5 text-sm text-white/60">{d.body}</p>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mt-20 rounded-card border border-white/10 bg-white/5 p-6 text-sm text-white/50"
        >
          Secure DMS does not replace ICJS, CCTNS or e-Courts. It is a secure document and evidence integrity layer designed to
          complement existing justice-system platforms — the frontend never connects directly to storage, TEE or the ledger;
          every action passes through an authorizing backend.
        </motion.div>
      </div>
    </main>
  );
}
