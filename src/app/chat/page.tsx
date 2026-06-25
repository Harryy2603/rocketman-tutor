"use client";

import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "@ai-sdk/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

function getMessageText(msg: UIMessage): string {
  if (!msg.parts) return (msg as any).content ?? "";
  return msg.parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { type: "text"; text: string }).text)
    .join("");
}

export default function ChatPage() {
  const conversationId = "00000000-0000-0000-0000-000000000000";

  const { messages, setMessages, sendMessage, status } = useChat({
    api: "/api/chat",
    body: { conversationId },
  });

  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/chat/history?conversationId=${conversationId}`, {
      cache: "no-store",
    })
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setMessages(
            data.map(
              (m: {
                id: string;
                role: "user" | "assistant";
                content: string;
              }) => ({
                id: m.id,
                role: m.role,
                parts: [{ type: "text" as const, text: m.content ?? "" }],
              }),
            ),
          );
        }
      })
      .catch((err) => console.error("Failed to load history", err));
  }, [setMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const isStreaming = status === "streaming" || status === "submitted";

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || isStreaming) return;
    sendMessage({ text });
    setInput("");
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#0A0A0A] text-slate-50 font-sans">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#0A0A0A]/80 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center">
            <span className="text-white font-bold text-sm">R</span>
          </div>
          <h1 className="font-semibold text-lg tracking-tight">
            RocketMan Tutor
          </h1>
        </div>
        <Link href="/dashboard">
          <Button
            variant="outline"
            className="bg-white text-black border-white hover:bg-black hover:text-white hover:border-white transition-all text-xs"
          >
            View Memory Dashboard
          </Button>
        </Link>
      </header>

      {/* ── Chat Area ──────────────────────────────────────────────────────── */}
      <div className="flex-1 px-4 py-6 md:px-8">
        <div className="max-w-3xl mx-auto space-y-6 pb-32">
          {messages.length === 0 && (
            <div className="text-center text-slate-400 mt-20">
              <p className="text-lg font-medium text-slate-200">
                Hello, User !.
              </p>
              <p className="text-sm mt-2">
                I am RocketMan. What are we studying today?
              </p>
            </div>
          )}

          {messages.map((msg, i) => {
            const isUser = msg.role === "user";
            const text = getMessageText(msg);
            if (!text && !isUser) return null;

            return (
              <div
                key={msg.id ?? i}
                className={`flex w-full ${isUser ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`relative max-w-[85%] md:max-w-[75%] px-5 py-3.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                    isUser
                      ? "bg-indigo-600 text-white rounded-br-sm shadow-md"
                      : "bg-white/5 border border-white/10 text-slate-200 rounded-bl-sm"
                  }`}
                >
                  {text}
                </div>
              </div>
            );
          })}

          {/* Thinking animation */}
          {isStreaming &&
            messages[messages.length - 1]?.role !== "assistant" && (
              <div className="flex w-full justify-start">
                <div className="bg-white/5 border border-white/10 text-indigo-400 font-mono text-xs rounded-2xl rounded-bl-sm px-5 py-3.5 flex flex-col gap-1">
                  <span className="animate-pulse">
                    · Retrieving learner profile...
                  </span>
                  <span className="animate-pulse [animation-delay:200ms]">
                    · Updating memory models...
                  </span>
                  <span className="animate-pulse [animation-delay:400ms]">
                    · Generating personalized response...
                  </span>
                </div>
              </div>
            )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* ── Input Area ─────────────────────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 w-full p-4 bg-gradient-to-t from-[#0A0A0A] via-[#0A0A0A]/95 to-transparent pb-8">
        <div className="max-w-3xl mx-auto">
          <form
            onSubmit={handleSubmit}
            className="flex items-center bg-[#111111] border border-white/10 rounded-2xl p-2 shadow-2xl focus-within:border-indigo-500/50 transition-all"
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question..."
              disabled={isStreaming}
              className="flex-1 bg-transparent border-0 focus-visible:ring-0 text-slate-200 placeholder:text-slate-500 text-base"
            />
            <Button
              type="submit"
              disabled={!input.trim() || isStreaming}
              className="ml-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl h-10 w-10 p-0 flex-shrink-0 transition-all disabled:opacity-50"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4.5 12h15m0 0l-6.75-6.75M19.5 12l-6.75 6.75"
                />
              </svg>
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
