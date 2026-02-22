export interface DesktopDriver {
  name: string;
  init(): Promise<void>;
  navigate(url: string): Promise<string>;
  click(selector: string): Promise<string>;
  type(selector: string, text: string): Promise<string>;
  screenshot(): Promise<string>; // Returns base64 string
  extract_text(): Promise<string>;
  execute_complex_flow(goal: string): Promise<string>;
  shutdown(): Promise<void>;
}

export interface DesktopAction {
  action: 'navigate' | 'click' | 'type' | 'screenshot' | 'extract' | 'complex';
  params: any;
}
