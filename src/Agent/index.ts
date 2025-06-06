import { GoogleGenerativeAI } from "@google/generative-ai";
import logger from "../config/logger";
import { geminiApiKeys } from "../secret";
import { handleError } from "../utils";
import { InstagramCommentSchema } from "./schema";
import fs from "fs";
import path from "path";
import * as readlineSync from "readline-sync";

export async function runAgent(schema: InstagramCommentSchema, prompt: string): Promise<any> {
    let currentApiKeyIndex = 0;  
    let geminiApiKey = geminiApiKeys[currentApiKeyIndex];

    if (!geminiApiKey) {
        logger.error("No Gemini API key available.");
        return "No API key available.";
    }
    const generationConfig = {
        responseMimeType: "application/json",
        responseSchema: schema,
    };

    const googleAI = new GoogleGenerativeAI(geminiApiKey);
    const model = googleAI.getGenerativeModel({
        model: "gemini-2.0-flash",
        generationConfig,
    });

    try {
        const result = await model.generateContent(prompt);

        if (!result || !result.response) {
            logger.info("No response received from the AI model. || Service Unavailable");
            return "Service unavailable!";
        }

        const responseText = result.response.text();
        const data = JSON.parse(responseText);

        return data;
    } catch (error) {
        await handleError(error, currentApiKeyIndex, schema, prompt, runAgent);
    }
}

export function chooseCharacter(): any {
    // Clear require cache to ensure fresh character loading
    Object.keys(require.cache).forEach(key => {
        if (key.includes('characters') && key.endsWith('.json')) {
            delete require.cache[key];
        }
    });

    const charactersDir = (() => {
        const buildPath = path.join(__dirname, "characters");
        if (fs.existsSync(buildPath)) {
            return buildPath;
        } else {
            // Fallback to source directory
            return path.join(process.cwd(), "src", "Agent", "characters");
        }
    })();
    
    // Force re-reading the directory contents
    fs.readdirSync(charactersDir, { withFileTypes: true }); // Clear any directory cache
    const files = fs.readdirSync(charactersDir);
    const jsonFiles = files.filter(file => file.endsWith(".json"));
    
    if (jsonFiles.length === 0) {
        throw new Error("No character JSON files found");
    }
    
    console.log("Select a character:");
    jsonFiles.forEach((file, index) => {
        console.log(`${index + 1}: ${file}`);
    });
    
    // Add option for BiryaniFactory with note that it's new
    const biryaniIndex = jsonFiles.findIndex(file => file.includes("BiryaniFactory"));
    if (biryaniIndex >= 0) {
        console.log(`\nRecommended: ${biryaniIndex + 1}: ${jsonFiles[biryaniIndex]} (New!)`);
    }
    
    const answer = readlineSync.question("Enter the number of your choice: ");
    const selection = parseInt(answer);
    if (isNaN(selection) || selection < 1 || selection > jsonFiles.length) {
        throw new Error("Invalid selection");
    }
    
    const chosenFile = path.join(charactersDir, jsonFiles[selection - 1]);
    
    // Read file with no caching
    const data = fs.readFileSync(chosenFile, { encoding: "utf8", flag: "r" });
    const characterConfig = JSON.parse(data);
    
    return characterConfig;
}

export function initAgent(): any {
    try {
        const character = chooseCharacter();
        console.log("Character selected:", character);
        return character;
    } catch (error) {
        console.error("Error selecting character:", error);
        process.exit(1);
    }
}

if (require.main === module) {
    (() => {
        initAgent();
    })();
}
