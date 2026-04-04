import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  isStreaming?: boolean;
}

interface AgentToolEvent {
  toolName: string;
  input: Record<string, unknown>;
  status: "started" | "completed" | "error";
  result?: string;
  error?: string;
  stepIndex: number;
  callId: string;
}

interface ChatContextType {
  messages: Message[];
  isLoading: boolean;
  toolEvents: AgentToolEvent[];

  // Chat actions
  sendMessage: (content: string) => Promise<void>;
  clearChat: () => void;
  stopAgent: () => void;

  // Page content access
  getPageContent: () => Promise<string | null>;
  getPageText: () => Promise<string | null>;
  getCurrentUrl: () => Promise<string | null>;
}

const ChatContext = createContext<ChatContextType | null>(null);

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return context;
};

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [toolEvents, setToolEvents] = useState<AgentToolEvent[]>([]);

  // Load initial messages from main process
  useEffect(() => {
    const loadMessages = async () => {
      try {
        const storedMessages = await window.sidebarAPI.getMessages();
        if (storedMessages && storedMessages.length > 0) {
          // Convert CoreMessage format to our frontend Message format
          const convertedMessages = storedMessages.map(
            (msg: any, index: number) => ({
              id: `msg-${index}`,
              role: msg.role,
              content:
                typeof msg.content === "string"
                  ? msg.content
                  : msg.content.find((p: any) => p.type === "text")?.text || "",
              timestamp: Date.now(),
              isStreaming: false,
            }),
          );
          setMessages(convertedMessages);
        }
      } catch (error) {
        console.error("Failed to load messages:", error);
      }
    };
    loadMessages();
  }, []);

  const sendMessage = useCallback(async (content: string) => {
    setIsLoading(true);
    setToolEvents([]);

    try {
      const messageId = Date.now().toString();

      // Send message to main process (which will handle context)
      await window.sidebarAPI.sendChatMessage({
        message: content,
        messageId: messageId,
      });

      // Messages will be updated via the chat-messages-updated event
    } catch (error) {
      console.error("Failed to send message:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearChat = useCallback(async () => {
    try {
      await window.sidebarAPI.clearChat();
      setMessages([]);
      setToolEvents([]);
    } catch (error) {
      console.error("Failed to clear chat:", error);
    }
  }, []);

  const stopAgent = useCallback(async () => {
    try {
      await window.sidebarAPI.stopAgent();
      setIsLoading(false);
    } catch (error) {
      console.error("Failed to stop agent:", error);
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

  // Set up message listeners
  useEffect(() => {
    // Listen for streaming response updates
    const handleChatResponse = (data: {
      messageId: string;
      content: string;
      isComplete: boolean;
    }) => {
      if (data.isComplete) {
        setIsLoading(false);
      }
    };

    // Listen for message updates from main process
    const handleMessagesUpdated = (updatedMessages: any[]) => {
      // Convert CoreMessage format to our frontend Message format
      const convertedMessages = updatedMessages.map(
        (msg: any, index: number) => ({
          id: `msg-${index}`,
          role: msg.role,
          content:
            typeof msg.content === "string"
              ? msg.content
              : msg.content.find((p: any) => p.type === "text")?.text || "",
          timestamp: Date.now(),
          isStreaming: false,
        }),
      );
      setMessages(convertedMessages);
    };

    window.sidebarAPI.onChatResponse(handleChatResponse);
    window.sidebarAPI.onMessagesUpdated(handleMessagesUpdated);

    // Listen for agent tool events
    window.sidebarAPI.onAgentToolEvent((event: AgentToolEvent) => {
      setToolEvents((prev) => {
        // Update existing event by unique callId, or append new one
        const idx = prev.findIndex((e) => e.callId === event.callId);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = event;
          return updated;
        }
        return [...prev, event];
      });
    });

    return () => {
      window.sidebarAPI.removeChatResponseListener();
      window.sidebarAPI.removeMessagesUpdatedListener();
      window.sidebarAPI.removeAgentToolEventListener();
    };
  }, []);

  const value: ChatContextType = {
    messages,
    isLoading,
    toolEvents,
    sendMessage,
    clearChat,
    stopAgent,
    getPageContent,
    getPageText,
    getCurrentUrl,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};
