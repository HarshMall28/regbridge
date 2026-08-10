import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
  type ReactElement,
} from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";

/* ─────────────────────────────────────────────────────────────
   Types
   ───────────────────────────────────────────────────────────── */
export interface PaletteCtx {
  /* palette open/close */
  open: boolean;
  setOpen: (v: boolean | ((prev: boolean) => boolean)) => void;

  /* AI answer page state (desktop: omnibar + page panel) */
  aiMode: boolean;
  setAiMode: (v: boolean) => void;

  /* useChat surface — single instance shared across desktop + mobile */
  messages: ReturnType<typeof useChat>["messages"];
  sendMessage: ReturnType<typeof useChat>["sendMessage"];
  stop: () => Promise<void>;
  status: ReturnType<typeof useChat>["status"];
  setMessages: ReturnType<typeof useChat>["setMessages"];

  /* convenience */
  hasChat: boolean;
  isBusy: boolean;

  /* reset everything */
  resetAi: () => void;
}

/* ─────────────────────────────────────────────────────────────
   Context (default is a no-op shell — real value comes from Provider)
   ───────────────────────────────────────────────────────────── */
export const PaletteContext = createContext<PaletteCtx>({
  open: false,
  setOpen: (_v: boolean | ((prev: boolean) => boolean)) => {},
  aiMode: false,
  setAiMode: () => {},
  messages: [],
  sendMessage: async () => {},
  stop: async () => {},
  status: "ready",
  setMessages: () => {},
  hasChat: false,
  isBusy: false,
  resetAi: () => {},
});

export const usePalette = () => useContext(PaletteContext);

/* ─────────────────────────────────────────────────────────────
   Provider — place once in __root.tsx
   ───────────────────────────────────────────────────────────── */
export function PaletteProvider({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const [aiMode, setAiMode] = useState(false);

  const { messages, sendMessage, stop, status, setMessages } =
    useChat({
      transport: new DefaultChatTransport({ api: "/api/chat" }),
    });

  const hasChat = messages.length > 0;

  /* ── isBusy with stability fallback ──────────────────────────
     AI SDK v7 bug: in dev, status can get stuck on "streaming"
     even after finish/[DONE] events arrive. We detect this by
     watching message content stability — if status says streaming
     but messages haven't changed for 1200ms, we force isBusy=false.
     On deployed Workers this never fires because status flips correctly.
  ─────────────────────────────────────────────────────────────── */
  const [forceDone, setForceDone] = useState(false);
  const stableTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const prevMsgSig = useRef<string>("");

  useEffect(() => {
    /* when a new stream starts, reset the force flag */
    if (status === "streaming") {
      setForceDone(false);
    }
    /* when status returns to ready normally, clear any pending timer */
    if (status === "ready") {
      setForceDone(false);
      if (stableTimer.current) clearTimeout(stableTimer.current);
    }
  }, [status]);

  useEffect(() => {
    if (status !== "streaming") return;

    /* build a signature of the last assistant message content */
    const lastAsst = [...messages]
      .reverse()
      .find((m) => m.role === "assistant");
    const sig = lastAsst
      ? JSON.stringify(
          lastAsst.parts?.map((p: any) =>
            p.type === "text" ? p.text?.length : p.state,
          ),
        )
      : "";

    if (sig === prevMsgSig.current) {
      /* content hasn't changed — start stability timer */
      if (!stableTimer.current) {
        stableTimer.current = setTimeout(() => {
          setForceDone(true);
          stableTimer.current = null;
        }, 1200);
      }
    } else {
      /* content changed — reset timer */
      prevMsgSig.current = sig;
      if (stableTimer.current) {
        clearTimeout(stableTimer.current);
        stableTimer.current = null;
      }
    }

    return () => {
      if (stableTimer.current) {
        clearTimeout(stableTimer.current);
        stableTimer.current = null;
      }
    };
  }, [messages, status]);

  const isBusy = status === "streaming" && !forceDone;

  const resetAi = useCallback(() => {
    setMessages([]);
    setAiMode(false);
    setForceDone(false);
  }, [setMessages]);

  return (
    <PaletteContext.Provider
      value={{
        open,
        setOpen,
        aiMode,
        setAiMode,
        messages,
        sendMessage,
        stop,
        status,
        setMessages,
        hasChat,
        isBusy,
        resetAi,
      }}
    >
      {children}
    </PaletteContext.Provider>
  );
}
