import { IgApiClient } from 'instagram-private-api';
import { get } from 'request-promise';
import path from 'path';
import fs from 'fs';
import { IGusername, IGpassword } from '../secret';
import logger from '../config/logger';
import { initAgent } from '../Agent';

// Biryani image URLs
const biryaniImageUrls = [
    "https://im.whatshot.in/img/2022/Jul/biryani-1658234689.jpg",
    "https://www.licious.in/blog/wp-content/uploads/2023/01/Hyderabadi-chicken-biryani.jpg",
    "https://www.indianhealthyrecipes.com/wp-content/uploads/2021/12/hyderabadi-biryani.jpg",
    "https://static.toiimg.com/thumb/53098310.cms?width=1200&height=900",
    "https://www.cubesnjuliennes.com/wp-content/uploads/2020/07/Chicken-Biryani-Recipe.jpg"
];

// Update message options
const updateMessages = [
    "🔥 ANNOUNCEMENT 🔥 We've upgraded our game! Now offering 100% money-back guarantee if you don't fall in love with our biryani. Check our Linktree for details: https://linktr.ee/ffuBiryanifactory #HyderabadiBiryani #MoneyBackChallenge",
    
    "Food creators! We're now OPEN for video collaborations and reviews. DM us or check our Linktree for partnership details: https://linktr.ee/ffuBiryanifactory #FoodCollab #BiryaniFactory",
    
    "Think you've had better biryani? Challenge accepted! Try ours with a 100% refund guarantee if you don't agree it's the best. All details in our Linktree: https://linktr.ee/ffuBiryanifactory #MoneyBackBiryani",
    
    "Calling all food bloggers and vloggers! We want to collaborate with you to showcase authentic Hyderabadi biryani. Plus, we're so confident in our flavors, we offer a money-back guarantee! Link in bio: https://linktr.ee/ffuBiryanifactory #BiryaniChallenge"
];

// Function to download an image from a URL
async function downloadImage(url: string, destination: string): Promise<void> {
    const imageBuffer = await get({
        url,
        encoding: null, // Ensures image is retrieved as a buffer
    });
    
    fs.writeFileSync(destination, imageBuffer);
    logger.info(`Image downloaded to: ${destination}`);
}

// Main function to post the update
async function postUpdate(): Promise<void> {
    try {
        // Initialize character for bio/content consistency
        const character = initAgent();
        logger.info(`Using character: ${character.name}`);
        
        // Random image and message selection
        const imageUrl = biryaniImageUrls[Math.floor(Math.random() * biryaniImageUrls.length)];
        const updateMessage = updateMessages[Math.floor(Math.random() * updateMessages.length)];
        const imagePath = path.join(__dirname, "../../temp_update_image.jpg");
        
        // Download the image
        await downloadImage(imageUrl, imagePath);
        
        // Initialize Instagram API
        const ig = new IgApiClient();
        ig.state.generateDevice(IGusername);
        
        // Login
        logger.info(`Logging in as ${IGusername}...`);
        await ig.account.login(IGusername, IGpassword);
        logger.info("Login successful!");
        
        // Read the image as a buffer
        const imageBuffer = fs.readFileSync(imagePath);
        
        // Post to Instagram
        logger.info("Uploading photo...");
        const response = await ig.publish.photo({
            file: imageBuffer,
            caption: updateMessage,
        });
        
        logger.info("Update posted successfully!");
        logger.info(`Post ID: ${response.media.id}`);
        
        // Clean up the temp image
        fs.unlinkSync(imagePath);
        
    } catch (error) {
        logger.error("Error posting update:", error);
    }
}

// Run the function if this script is executed directly
if (require.main === module) {
    postUpdate().then(() => {
        logger.info("Update posting process completed");
    }).catch(err => {
        logger.error("Error in update posting process:", err);
    });
}

export { postUpdate }; 