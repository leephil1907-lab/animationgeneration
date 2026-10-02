export type Role = 'user' | 'assistant' | 'system' | 'tool';

export type ToolCall = {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: string;
  status: 'pending' | 'running' | 'completed' | 'error';
};

export type Message = {
  id: string;
  role: Role;
  content: string;
  createdAt: string;
  toolCalls?: ToolCall[];
};

export type Conversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
};

export type ToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};
