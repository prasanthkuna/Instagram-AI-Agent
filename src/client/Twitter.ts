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

// BiryaniFactory Linktree URL to include in tweets
const LINKTREE_URL = "https://linktr.ee/ffuBiryanifactory";

// Function to download an image from a URL and save it to the assets folder
const downloadImageToAssets = async (url: string, filename: string): Promise<string> => {
    const assetsPath = path.join(__dirname, "../../src/assets/biryani_images");
    const filepath = path.join(assetsPath, filename);
    
    // If directory doesn't exist, create it
    if (!fs.existsSync(assetsPath)) {
        fs.mkdirSync(assetsPath, { recursive: true });
    }
    
    // Only download if file doesn't already exist
    if (!fs.existsSync(filepath)) {
        const response = await axios({
            url,
            method: 'GET',
            responseType: 'stream'
        });
        
        return new Promise((resolve, reject) => {
            const writer = fs.createWriteStream(filepath);
            response.data.pipe(writer);
            writer.on('finish', () => resolve(filepath));
            writer.on('error', reject);
        });
    }
    
    return filepath;
};

// Function to select a random tweet text from the character's postExamples
// and append the Linktree URL
const getRandomTweetContent = (): string => {
    let tweetContent = "";
    
    if (!selectedCharacter || !selectedCharacter.postExamples || selectedCharacter.postExamples.length === 0) {
        // Default tweets with money-back guarantee and collaboration invitations
        const defaultTweets = [
            "Try our authentic Hyderabadi biryani - challenging Shah Ghouse and Bawarchi! #BiryaniFactory #HyderabadiFood",
            "We're so confident in our biryani that we offer a 100% money-back guarantee if you don't love it! #MoneyBackBiryani",
            "Calling food bloggers and critics! We're open for honest reviews and exciting food collaborations. DM us! #FoodCollabs",
            "Take the #BiryaniChallenge - we dare you to find better biryani in Hyderabad! If you do, your meal is on us!"
        ];
        const randomIndex = Math.floor(Math.random() * defaultTweets.length);
        tweetContent = defaultTweets[randomIndex];
    } else {
        const randomIndex = Math.floor(Math.random() * selectedCharacter.postExamples.length);
        tweetContent = selectedCharacter.postExamples[randomIndex];
    }
    
    // Ensure the tweet isn't too long with the URL
    const MAX_TWEET_LENGTH = 280;
    const LINKTREE_TEXT = `\n\nOrder now: ${LINKTREE_URL}`;
    
    if ((tweetContent.length + LINKTREE_TEXT.length) > MAX_TWEET_LENGTH) {
        // Truncate the tweet content to make room for the Linktree URL
        tweetContent = tweetContent.substring(0, MAX_TWEET_LENGTH - LINKTREE_TEXT.length - 3) + "...";
    }
    
    return tweetContent + LINKTREE_TEXT;
};

// List of biryani image URLs to download to our assets folder
const biryaniImageUrls = [
    { url: "https://im.whatshot.in/img/2022/Jul/biryani-1658234689.jpg", filename: "hyderabadi-biryani-1.jpg" },
    { url: "https://www.licious.in/blog/wp-content/uploads/2023/01/Hyderabadi-chicken-biryani.jpg", filename: "hyderabadi-biryani-2.jpg" },
    { url: "https://www.indianhealthyrecipes.com/wp-content/uploads/2021/12/hyderabadi-biryani.jpg", filename: "hyderabadi-biryani-3.jpg" },
    { url: "https://static.toiimg.com/thumb/53098310.cms?width=1200&height=900", filename: "hyderabadi-biryani-4.jpg" },
    { url: "https://www.cubesnjuliennes.com/wp-content/uploads/2020/07/Chicken-Biryani-Recipe.jpg", filename: "hyderabadi-biryani-5.jpg" }
];

// Function to download all initial images to our assets folder
const downloadAllImages = async (): Promise<void> => {
    for (const image of biryaniImageUrls) {
        try {
            await downloadImageToAssets(image.url, image.filename);
            logger.info(`Downloaded image: ${image.filename}`);
        } catch (error) {
            logger.error(`Error downloading image ${image.filename}:`, error);
        }
    }
};

// Function to get a random image from the assets folder
const getRandomImage = (): string => {
    const assetsPath = path.join(__dirname, "../../src/assets/biryani_images");
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(assetsPath)) {
        fs.mkdirSync(assetsPath, { recursive: true });
        logger.info(`Created assets directory: ${assetsPath}`);
        return "";
    }
    
    // Get all images from the directory
    const files = fs.readdirSync(assetsPath)
        .filter(file => ['.jpg', '.jpeg', '.png'].includes(path.extname(file).toLowerCase()));
    
    // If no images found, return empty string
    if (files.length === 0) {
        logger.warn("No images found in assets directory");
        return "";
    }
    
    // Select a random image
    const randomFile = files[Math.floor(Math.random() * files.length)];
    return path.join(assetsPath, randomFile);
};

// Post a tweet with a biryani image and Linktree URL
const postBiryaniTweet = async (): Promise<void> => {
    try {
        // Check if we can send a tweet (rate limit check)
        const canTweet = await canSendTweet();
        if (!canTweet) {
            logger.info("Twitter rate limit reached. Cannot send tweet at this time.");
            return;
        }

        // Get a random image from assets
        let imagePath = getRandomImage();
        
        // If no image in assets, download one
        if (!imagePath) {
            const randomImageIndex = Math.floor(Math.random() * biryaniImageUrls.length);
            const image = biryaniImageUrls[randomImageIndex];
            imagePath = await downloadImageToAssets(image.url, image.filename);
        }
        
        // Upload the image to Twitter
        const mediaId = await twitterClient.v1.uploadMedia(imagePath);
        
        // Get tweet content from character's postExamples plus Linktree
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
            imageUrl: imagePath,
            timeTweeted: new Date()
        });
        
        await newTweet.save();
        
        logger.info(`Tweet posted successfully: ${tweetContent}`);
        logger.info(`Tweet response: ${JSON.stringify(tweetResponse)}`);
        
    } catch (error) {
        logger.error("Error posting tweet:", error);
    }
};

// Main function to run Twitter operations
export async function main() {
    try {
        logger.info("Starting Twitter agent...");
        
        // Make sure the assets directory exists
        const assetsPath = path.join(__dirname, "../../src/assets/biryani_images");
        if (!fs.existsSync(assetsPath)) {
            fs.mkdirSync(assetsPath, { recursive: true });
            
            // Download initial images to assets folder
            logger.info("Downloading initial biryani images to assets folder...");
            await downloadAllImages();
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