"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export function Transcript() {
  const messages = useQuery(api.messages.list) ?? [];
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  return (
    <div
      ref={scrollRef}
      className="scroll-thin mt-2 w-full max-w-[640px] flex-1 space-y-3 overflow-y-auto pb-6 [mask-image:linear-gradient(to_bottom,transparent,black_28px)]"
    >
      {messages.length === 0 && (
        <p className="pt-10 text-center text-[13px] text-white/25">
          Activate Jarvis and start speaking.
        </p>
      )}
      <AnimatePresence initial={false}>
        {messages.map((m) => (
          <motion.div
            key={m._id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-[13.5px] leading-relaxed ${
                m.role === "user"
                  ? "rounded-br-md border border-white/10 bg-white/[0.06] text-white/85"
                  : "rounded-bl-md border border-cyan-200/10 bg-cyan-400/[0.05] text-cyan-50/90"
              }`}
            >
              {m.role === "assistant" && (
                <span className="label-xs mb-1 block !text-[9px] text-cyan-200/40">Jarvis</span>
              )}
              <span className="whitespace-pre-wrap">{m.text}</span>
              {m.status === "streaming" && (
                <span className="blink ml-1 inline-block h-3 w-[2px] translate-y-[2px] bg-current" />
              )}
              {m.status === "interrupted" && (
                <span className="mono ml-2 text-[10px] text-white/30">— interrupted</span>
              )}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
