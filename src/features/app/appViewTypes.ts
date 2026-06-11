export type ProjectFormValues = {
  name: string;
  clientName: string;
  industry: string;
  description: string;
  memo: string;
};

export type CodexConnectionAction = "refresh" | "smoke" | "login";
export type CursorConnectionAction = "refresh" | "smoke";
