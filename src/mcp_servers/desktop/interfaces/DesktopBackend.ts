export interface DesktopBackend {
  init(): Promise<void>;
  navigate_to(url: string): Promise<string>;
  click_element(selector: string): Promise<string>;
  type_text(selector: string, text: string): Promise<string>;
  take_screenshot(): Promise<string>; // Returns base64 string
  extract_page_text(): Promise<string>;
  shutdown(): Promise<void>;
}
