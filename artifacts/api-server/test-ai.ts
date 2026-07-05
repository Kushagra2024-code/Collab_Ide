import { ai } from "@workspace/integrations-gemini-ai";
import * as dotenv from "dotenv";
dotenv.config();

async function run() {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: "Hello",
    });
    console.log("Success:", response.text);
  } catch (e) {
    console.error("Error:", e);
  }
}
run();
