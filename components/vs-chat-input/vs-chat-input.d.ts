export interface VsFileRec {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  progress?: number;
}

export interface VsSubmitDetail {
  text: string;
  files: VsFileRec[];
  model: string;
}

export interface VsChatInputApi {
  setBusy(busy: boolean): void;
  setProgress(id: string, progress: number): void;
  addFiles(files: FileList | File[]): string[];
  removeFile(id: string): void;
  clear(): void;
  submit(): void;
  stop(): void;
  focus(): void;
  setDisabled(disabled: boolean): void;
  value: string;
  model: string;
  readonly files: VsFileRec[];
  readonly busy: boolean;
  readonly disabled: boolean;
}

export function mount(form: HTMLFormElement): VsChatInputApi | null;
export const vsChatInput: { mount: typeof mount };
