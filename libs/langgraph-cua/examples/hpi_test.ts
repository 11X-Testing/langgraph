
import "dotenv/config";
import { createCua } from "../src/index.js";
import { HumanMessage } from "@langchain/core/messages";
import { BrowserManager } from "../src/browser-manager.js";
import * as fs from "fs";
import * as path from "path";

const SCREENSHOT_DIR = "screenshots";

async function main() {
    console.log("Starting HPI Test Script...");
    console.log(`GOOGLE_API_KEY present: ${!!process.env.GOOGLE_API_KEY}`);

    // Ensure screenshot directory exists
    if (!fs.existsSync(SCREENSHOT_DIR)) {
        fs.mkdirSync(SCREENSHOT_DIR);
    }


    // Initialize the specific graph
    const graph = createCua({
        onSafetyConfirmation: async (decision) => {
            console.log("---- SAFETY CONFIRMATION REQUESTED ----");
            console.log(`Explanation: ${decision.explanation}`);
            console.log(`Decision Type: ${decision.decision}`);
            console.log("AUTOMATICALLY CONFIRMING (Test Mode)");
            return true;
        },
        uploadScreenshot: async (dataUri) => {
            // Data URI format: data:image/png;base64,....
            const base64Data = dataUri.replace(/^data:image\/png;base64,/, "");
            const filename = `screenshot_${Date.now()}.png`;
            const filepath = path.join(SCREENSHOT_DIR, filename);

            fs.writeFileSync(filepath, base64Data, 'base64');
            console.log(`Saved screenshot to ${filepath}`);

            // Return valid data URI so the model can still use it (inline)
            return dataUri;
        }
    });

    const messages = [
        new HumanMessage("Navigate to www.hpi.de, accept cookies and then look for the impressum page")
    ];

    try {
        const stream = await graph.stream(
            { messages },
            {
                streamMode: "updates",
                // We need to set recursion limit higher just in case
                recursionLimit: 50
            }
        );

        console.log("Stream started. Navigating to HPI...");

        for await (const update of stream) {
            console.log("----\nUpdate received\n----");
            // We can inspect update to see what's happening
            // Ideally we would see tool calls and outputs
            if (update && typeof update === 'object') {
                // Basic logging of node updates
                const keys = Object.keys(update);
                console.log(`Updated nodes: ${keys.join(", ")}`);
                for (const key of keys) {
                    const nodeUpdate = (update as any)[key];
                    if (nodeUpdate.messages && nodeUpdate.messages.length > 0) {
                        const lastMsg = nodeUpdate.messages[nodeUpdate.messages.length - 1];
                        console.log(`Last message type: ${lastMsg._getType()}`);
                        if (lastMsg._getType() === "tool") {
                            console.log("Tool output received (actions executed).");
                        }
                        if (lastMsg._getType() === "ai") {
                            if (lastMsg.tool_calls && lastMsg.tool_calls.length > 0) {
                                console.log(`AI invoking tool: ${lastMsg.tool_calls[0].name}`);
                                // console.log(JSON.stringify(lastMsg.tool_calls[0], null, 2));
                            } else {
                                console.log(`AI message: ${lastMsg.content}`);
                            }
                        }
                    }

                    // If instanceId is present, log it
                    if (nodeUpdate.instanceId) {
                        console.log(`Instance ID: ${nodeUpdate.instanceId}`);
                    }
                }
            }
        }

    } catch (e) {
        console.error("Error running graph:", e);
    } finally {
        console.log("Closing browser sessions...");
        await BrowserManager.getInstance().closeAll();
        console.log("Done.");
    }
}

if (import.meta.url === import.meta.resolve(process.argv[1])) {
    main().catch(console.error);
}
