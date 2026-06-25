"use client";

import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LandingPage() {
  const router = useRouter();
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const supabase = createClient();

  const handleStartDemo = async () => {
    setIsLoggingIn(true);
    
    // 1. Silently log in using our demo credentials
    const { error } = await supabase.auth.signInWithPassword({
      email: 'demo@rocketman.com',
      password: 'password123',
    });

    if (error) {
      console.error("Login failed:", error.message);
      alert("Error: Make sure you created demo@rocketman.com with password123 in Supabase Auth!");
      setIsLoggingIn(false);
      return;
    }

    // 2. Redirect to chat with secure cookies set
    router.push('/chat');
  };

  return (
    <main className="relative min-h-screen bg-[#080808] text-white overflow-hidden flex flex-col items-center justify-center">
      {/* Ambient background glow */}
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] rounded-full bg-indigo-600/10 blur-[120px]" />
        <div className="absolute top-1/3 left-1/3 w-[300px] h-[300px] rounded-full bg-violet-700/8 blur-[100px]" />
      </div>

      {/* Subtle grid overlay */}
      <div
        className="pointer-events-none absolute inset-0 z-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(#ffffff 1px, transparent 1px), linear-gradient(90deg, #ffffff 1px, transparent 1px)",
          backgroundSize: "72px 72px",
        }}
      />

      {/* Nav */}
      <nav className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-8 py-5">
        <span className="text-sm font-medium tracking-tight text-white/40 font-mono">
          ROCKETMAN
        </span>
        <div className="flex items-center gap-6 text-sm text-white/35">
          <a href="#" className="hover:text-white/70 transition-colors">Docs</a>
          <a href="#" className="hover:text-white/70 transition-colors">Pricing</a>
          <a
            href="#"
            className="px-3 py-1.5 rounded-md border border-white/10 hover:border-white/25 hover:text-white/70 transition-all"
          >
            Sign in
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 flex flex-col items-center text-center px-6 max-w-4xl mx-auto">
        {/* Badge */}
        <div className="mb-8 inline-flex items-center gap-2 px-3 py-1 rounded-full border border-indigo-500/30 bg-indigo-500/5 text-indigo-300 text-xs font-medium tracking-wide uppercase">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
          AI-Powered Learning
        </div>

        {/* Headline */}
        <h1 className="text-6xl sm:text-7xl lg:text-8xl font-bold tracking-[-0.04em] leading-[0.95] mb-6">
          <span className="text-white">RocketMan</span>
          <br />
          <span
            className="bg-gradient-to-r from-indigo-400 via-violet-400 to-indigo-300 bg-clip-text text-transparent"
          >
            AI Tutor
          </span>
        </h1>

        {/* Subheadline */}
        <p className="text-white/40 text-lg sm:text-xl max-w-xl leading-relaxed mb-10 font-light">
          Adaptive, conversational learning that meets you exactly where you are.
          Ask anything. Understand everything.
        </p>

        {/* CTA */}
        <Button
          size="lg"
          onClick={handleStartDemo}
          disabled={isLoggingIn}
          className="relative group h-12 px-8 bg-white text-black font-semibold text-sm tracking-tight hover:bg-white/90 transition-all duration-200 rounded-lg shadow-[0_0_40px_rgba(255,255,255,0.08)] hover:shadow-[0_0_60px_rgba(255,255,255,0.15)] disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {isLoggingIn ? (
            "Authenticating..."
          ) : (
            <>
              Start Interactive Demo
              <svg
                className="ml-2 w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </>
          )}
        </Button>

        {/* Social proof micro-line */}
        <p className="mt-6 text-white/20 text-xs tracking-wide">
          No signup required &middot; Free to try
        </p>
      </section>

      {/* Bottom fade */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-[#080808] to-transparent z-10" />
    </main>
  );
}