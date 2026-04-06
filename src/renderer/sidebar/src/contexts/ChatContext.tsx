/* eslint-disable react-refresh/only-export-components */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { AgentToolEvent, Message } from "@common/components/chat/types";
import { convertMessages } from "@common/lib/chatSession";
import {
  EMPTY_RUN,
  type ChatHistoryEntry,
  type ChatSessionState,
  type CompanionEvent,
  type LatestRun,
  type SourcePage,
} from "@common/types/chatSession";

interface ChatContextType {
  sessionId: string;
  messages: Message[];
  isLoading: boolean;
  toolEvents: AgentToolEvent[];
  companionEvents: CompanionEvent[];
  sourcePage: SourcePage | null;
  latestRun: LatestRun;
  sessionTitle: string;
  currentWorkTabId: string | null;
  agentTabIds: string[];
  history: ChatHistoryEntry[];

  sendMessage: (content: string) => Promise<void>;
  clearChat: () => void;
  stopAgent: () => void;
  openSession: (sessionId: string) => Promise<void>;
  getPageContent: () => Promise<string | null>;
  getPageText: () => Promise<string | null>;
  getCurrentUrl: () => Promise<string | null>;
}

const ChatContext = createContext<ChatContextType | null>(null);

const DEFAULT_STATE: ChatSessionState = {
  sessionId: "unknown-session",
  sourcePage: null,
  messages: [],
  toolEvents: [],
  companionEvents: [],
  latestRun: EMPTY_RUN,
  sessionTitle: "Untitled",
  currentWorkTabId: null,
  agentTabIds: [],
  history: [],
};

export const useChat = (): ChatContextType => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return context;
};

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [sessionState, setSessionState] =
    useState<ChatSessionState>(DEFAULT_STATE);

  const isLoading = sessionState.latestRun.status === "running";
  const messages = convertMessages(sessionState.messages, isLoading);

  useEffect(() => {
    const loadSession = async (): Promise<void> => {
      try {
        const initialState = await window.sidebarAPI.getChatSessionState();
        setSessionState(initialState);
      } catch (error) {
        console.error("Failed to load chat session:", error);
      }
    };

    loadSession();
  }, []);

  const sendMessage = useCallback(async (content: string) => {
    try {
      await window.sidebarAPI.sendChatMessage({
        message: content,
        messageId: Date.now().toString(),
      });
    } catch (error) {
      console.error("Failed to send message:", error);
    }
  }, []);

  const clearChat = useCallback(async () => {
    try {
      await window.sidebarAPI.clearChat();
    } catch (error) {
      console.error("Failed to clear chat:", error);
    }
  }, []);

  const stopAgent = useCallback(async () => {
    try {
      await window.sidebarAPI.stopAgent();
    } catch (error) {
      console.error("Failed to stop agent:", error);
    }
  }, []);

  const openSession = useCallback(async (sessionId: string) => {
    try {
      await window.sidebarAPI.openChatSession(sessionId);
    } catch (error) {
      console.error("Failed to open chat session:", error);
    }
  }, []);

  const getPageContent = useCallback(async () => {
    try {
      return await window.sidebarAPI.getPageContent();
    } catch (error) {
      console.error("Failed to get page content:", error);
      return null;
    }
  }, []);

  const getPageText = useCallback(async () => {
    try {
      return await window.sidebarAPI.getPageText();
    } catch (error) {
      console.error("Failed to get page text:", error);
      return null;
    }
  }, []);

  const getCurrentUrl = useCallback(async () => {
    try {
      return await window.sidebarAPI.getCurrentUrl();
    } catch (error) {
      console.error("Failed to get current URL:", error);
      return null;
    }
  }, []);

  useEffect(() => {
    const handleSessionUpdated = (updatedState: ChatSessionState): void => {
      setSessionState(updatedState);
    };

    window.sidebarAPI.onChatSessionUpdated(handleSessionUpdated);

    return () => {
      window.sidebarAPI.removeChatSessionUpdatedListener();
    };
  }, []);

  const value: ChatContextType = {
    sessionId: sessionState.sessionId,
    messages,
    isLoading,
    toolEvents: sessionState.toolEvents,
    companionEvents: sessionState.companionEvents ?? [],
    sourcePage: sessionState.sourcePage,
    latestRun: sessionState.latestRun,
    sessionTitle: sessionState.sessionTitle,
    currentWorkTabId: sessionState.currentWorkTabId,
    agentTabIds: sessionState.agentTabIds,
    history: sessionState.history,
    sendMessage,
    clearChat,
    stopAgent,
    openSession,
    getPageContent,
    getPageText,
    getCurrentUrl,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};
