import { twitterClient } from "./X-bot/client";
import { canSendTweet } from "../utils";
import Tweet from "../Agent/schema";
import { initAgent } from "../Agent";
import logger from "../config/logger";
import fs from "fs";
import path from "path";
import axios from "axios";

// Store the selected character globally
let selectedCharacter: any = null;

// Function to download an image from a URL
const downloadImage = async (url: string, filepath: string): Promise<void> => {
    const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream'
    });
    
    return new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(filepath);
        response.data.pipe(writer);
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
};

// Function to select a random tweet text from the character's postExamples
const getRandomTweetContent = (): string => {
    if (!selectedCharacter || !selectedCharacter.postExamples || selectedCharacter.postExamples.length === 0) {
        return "Try our authentic Hyderabadi biryani - challenging Shah Ghouse and Bawarchi! #BiryaniFactory #HyderabadiFood";
    }
    
    const randomIndex = Math.floor(Math.random() * selectedCharacter.postExamples.length);
    return selectedCharacter.postExamples[randomIndex];
};

// List of biryani image URLs
const biryaniImageUrls = [
    "https://im.whatshot.in/img/2022/Jul/biryani-1658234689.jpg",
    "https://www.licious.in/blog/wp-content/uploads/2023/01/Hyderabadi-chicken-biryani.jpg",
    "https://www.indianhealthyrecipes.com/wp-content/uploads/2021/12/hyderabadi-biryani.jpg",
    "https://static.toiimg.com/thumb/53098310.cms?width=1200&height=900",
    "https://www.cubesnjuliennes.com/wp-content/uploads/2020/07/Chicken-Biryani-Recipe.jpg"
];

// Post a tweet with a biryani image
const postBiryaniTweet = async (): Promise<void> => {
    try {
        // Check if we can send a tweet (rate limit check)
        const canTweet = await canSendTweet();
        if (!canTweet) {
            logger.info("Twitter rate limit reached. Cannot send tweet at this time.");
            return;
        }

        // Select a random biryani image
        const imageUrl = biryaniImageUrls[Math.floor(Math.random() * biryaniImageUrls.length)];
        const imagePath = path.join(__dirname, "../../temp_biryani_image.jpg");
        
        // Download the image
        await downloadImage(imageUrl, imagePath);
        
        // Upload the image to Twitter
        const mediaId = await twitterClient.v1.uploadMedia(imagePath);
        
        // Get tweet content from character's postExamples
        const tweetContent = getRandomTweetContent();
        
        // Send the tweet with the image
        const tweetResponse = await twitterClient.v2.tweet({
            text: tweetContent,
            media: {
                media_ids: [mediaId]
            }
        });
        
        // Save tweet to database
        const newTweet = new Tweet({
            tweetContent,
            imageUrl,
            timeTweeted: new Date()
        });
        
        await newTweet.save();
        
        // Clean up the temp image
        fs.unlinkSync(imagePath);
        
        logger.info(`Tweet posted successfully: ${tweetContent}`);
        logger.info(`Tweet response: ${JSON.stringify(tweetResponse)}`);
        
    } catch (error) {
        logger.error("Error posting tweet:", error);
    }
};

// Main function to run twitter operations
export async function main() {
    try {
        logger.info("Starting Twitter agent...");
        
        // Make sure the temp directory exists
        const tempDir = path.dirname(path.join(__dirname, "../../temp_biryani_image.jpg"));
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        
        // Initialize with BiryaniFactory character
        selectedCharacter = initAgent();
        logger.info(`Using character: ${selectedCharacter.name}`);
        
        // Post a tweet
        await postBiryaniTweet();
        
        logger.info("Twitter operation completed successfully");
    } catch (error) {
        logger.error("Error in Twitter operations:", error);
    }
}

// If this file is run directly
if (require.main === module) {
    main().catch(err => {
        logger.error("Error running Twitter agent:", err);
    });
} 