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
  open: boolean;
  setOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  aiMode: boolean;
  setAiMode: (v: boolean) => void;
  messages: ReturnType<typeof useChat>["messages"];
  sendMessage: ReturnType<typeof useChat>["sendMessage"];
  stop: () => Promise<void>;
  status: ReturnType<typeof useChat>["status"];
  setMessages: ReturnType<typeof useChat>["setMessages"];
  hasChat: boolean;
  isBusy: boolean;
  resetAi: () => void;
  focusSearchNonce: number;
  requestFocusSearch: () => void;
  /* new: pre-fill palette with a query and auto-submit */
  initialQuery: string;
  setInitialQuery: (q: string) => void;
}

/* ─────────────────────────────────────────────────────────────
   Context
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
  focusSearchNonce: 0,
  requestFocusSearch: () => {},
  initialQuery: "",
  setInitialQuery: () => {},
});

export const usePalette = () => useContext(PaletteContext);

/* ─────────────────────────────────────────────────────────────
   Provider
   ───────────────────────────────────────────────────────────── */
export function PaletteProvider({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const [aiMode, setAiMode] = useState(false);
  const [focusSearchNonce, setFocusSearchNonce] = useState(0);
  const [initialQuery, setInitialQuery] = useState("");

  const { messages, sendMessage, stop, status, setMessages } =
    useChat({
      transport: new DefaultChatTransport({ api: "/api/chat" }),
    });

  const hasChat = messages.length > 0;

  /* ── isBusy stability fallback ── */
  const [forceDone, setForceDone] = useState(false);
  const stableTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const prevMsgSig = useRef<string>("");

  useEffect(() => {
    if (status === "streaming") setForceDone(false);
    if (status === "ready") {
      setForceDone(false);
      if (stableTimer.current) clearTimeout(stableTimer.current);
    }
  }, [status]);

  useEffect(() => {
    if (status !== "streaming") return;
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
      if (!stableTimer.current) {
        stableTimer.current = setTimeout(() => {
          setForceDone(true);
          stableTimer.current = null;
        }, 600);
      }
    } else {
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

  /* isBusy is false immediately when messages are cleared */
  const isBusy =
    status === "streaming" && !forceDone && messages.length > 0;

  const resetAi = useCallback(() => {
    setMessages([]);
    setAiMode(false);
    setForceDone(false);
  }, [setMessages]);

  const requestFocusSearch = useCallback(() => {
    setFocusSearchNonce((n) => n + 1);
  }, []);

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
        focusSearchNonce,
        requestFocusSearch,
        initialQuery,
        setInitialQuery,
      }}
    >
      {children}
    </PaletteContext.Provider>
  );
}
