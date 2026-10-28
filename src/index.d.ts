import type { Context, MiddlewareHandler } from 'hono';

export interface AsyntaiOptions {
  /** Your Asyntai widget ID, for example `asyntai_1a2b3c4d5e6f`. Required. */
  widgetId: string;
  /** Return true to leave a page without the widget, for example admin pages. */
  skip?: (c: Context) => boolean;
  /** Advanced. Load the widget script from another URL. */
  scriptUrl?: string;
}

/** Middleware that adds the Asyntai chat widget to every HTML page. */
export declare function aiChatbot(options: AsyntaiOptions): MiddlewareHandler;

/** The `<script>` tag on its own, for templates where you place it by hand. */
export declare function chatbotScript(options: AsyntaiOptions): string;

export declare function validateOptions(options: AsyntaiOptions): {
  widgetId: string;
  scriptUrl: string;
  skip: ((c: Context) => boolean) | null;
};
export declare function buildLoader(widgetId: string, scriptUrl: string): string;
export declare function injectIntoHtml(html: string, tag: string): string;
export declare const DEFAULT_SCRIPT_URL: string;

export default aiChatbot;
