import { Browser, chromium, Page } from "playwright";
import { v4 as uuidv4 } from "uuid";

interface ManagedInstance {
    id: string;
    browser: Browser;
    page: Page;
    lastActive: number;
}

export class BrowserManager {
    private static instance: BrowserManager;
    private instances: Map<string, ManagedInstance> = new Map();

    private constructor() { }

    public static getInstance(): BrowserManager {
        if (!BrowserManager.instance) {
            BrowserManager.instance = new BrowserManager();
        }
        return BrowserManager.instance;
    }

    public async createInstance(): Promise<string> {
        const id = uuidv4();
        const browser = await chromium.launch({
            headless: false, // Or true, depending on requirements. Default to false for visual feedback if possible, or true for server env.
            // Keeping it false for now as per user request to see it ? Actually request didn't specify, but "headless" is usually safer for pure agents unless debugging.
            // Let's stick to default behavior or configurable? 
            // User said "launch a Chromium session with playwright attached". 
            // I'll default to headless: false for local dev/testing usually preferred by humans, but for CI it might fail.
            // Let's use headless: true for stability effectively mimicking a "VM" in the background, 
            // but the user might want to see it. 
            // I'll make it configurable via env var if I could, but for now I'll stick to headless: true for robustness
            // unless the user explicitly asked for "headed".
            // Re-reading user request: "launch a Chromium session with playwright attached". 
            // I'll set headless: false so they can potentially see it if they run it locally.
        });
        const page = await browser.newPage();

        // Set a large viewport to match the model's expectations usually
        await page.setViewportSize({ width: 1024, height: 768 });

        this.instances.set(id, {
            id,
            browser,
            page,
            lastActive: Date.now(),
        });

        return id;
    }

    public getPage(id: string): Page | undefined {
        const instance = this.instances.get(id);
        if (instance) {
            instance.lastActive = Date.now();
            return instance.page;
        }
        return undefined;
    }

    public async closeInstance(id: string): Promise<void> {
        const instance = this.instances.get(id);
        if (instance) {
            await instance.browser.close();
            this.instances.delete(id);
        }
    }

    public async closeAll(): Promise<void> {
        for (const [id, instance] of this.instances) {
            await instance.browser.close();
            this.instances.delete(id);
        }
    }
}
