import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useChat } from "../../../sidebar/src/contexts/ChatContext";
import {
  getSessionTitle,
  getVisibleMessages,
  hasSessionContent,
} from "../domain/sessionView";

type NewTabController = ReturnType<typeof useChat> & {
  historyRef: RefObject<HTMLElement | null>;
  isHistoryOpen: boolean;
  title: string;
  visibleMessages: ReturnType<typeof getVisibleMessages>;
  hasSessionContent: boolean;
  toggleHistory: () => void;
  handleHistorySelect: (sessionId: string) => Promise<void>;
  handleCreateChat: () => void;
};

export function useNewTabController(): NewTabController {
  const chat = useChat();
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const historyRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    document.documentElement.classList.add("dark");

    return () => {
      document.documentElement.classList.remove("dark");
    };
  }, []);

  useEffect(() => {
    if (!isHistoryOpen) return;

    const onPointerDown = (event: PointerEvent): void => {
      if (!historyRef.current) return;
      if (historyRef.current.contains(event.target as Node)) return;
      setIsHistoryOpen(false);
    };

    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [isHistoryOpen]);

  const visibleMessages = useMemo(
    () => getVisibleMessages(chat.messages),
    [chat.messages],
  );

  const title = useMemo(
    () => getSessionTitle(chat.sessionTitle),
    [chat.sessionTitle],
  );

  const hasContent = useMemo(
    () => hasSessionContent(visibleMessages, chat.toolEvents, chat.latestRun),
    [chat.latestRun, chat.toolEvents, visibleMessages],
  );

  const handleHistorySelect = async (sessionId: string): Promise<void> => {
    await chat.openSession(sessionId);
    setIsHistoryOpen(false);
  };

  const handleCreateChat = (): void => {
    void window.sidebarAPI.createChatTab();
  };

  return {
    ...chat,
    historyRef,
    isHistoryOpen,
    title,
    visibleMessages,
    hasSessionContent: hasContent,
    toggleHistory: () => setIsHistoryOpen((value) => !value),
    handleHistorySelect,
    handleCreateChat,
  };
}
