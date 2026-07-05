import { GoogleGenAI } from "@google/genai";
import * as dotenv from "dotenv";
dotenv.config();

const ai = new GoogleGenAI({});
async function run() {
  const models = await ai.models.list();
  for await (const model of models) {
    console.log(model.name);
  }
}
run().catch(console.error);
