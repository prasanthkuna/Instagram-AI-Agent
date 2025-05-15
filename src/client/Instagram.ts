import { Browser, DEFAULT_INTERCEPT_RESOLUTION_PRIORITY } from "puppeteer";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import AdblockerPlugin from "puppeteer-extra-plugin-adblocker";
import UserAgent from "user-agents";
import { Server } from "proxy-chain";
import { IGpassword, IGusername } from "../secret";
import logger from "../config/logger";
import { Instagram_cookiesExist, loadCookies, saveCookies } from "../utils";
import { runAgent, initAgent } from "../Agent";
import { getInstagramCommentSchema } from "../Agent/schema";

// Add stealth plugin to puppeteer
puppeteer.use(StealthPlugin());
puppeteer.use(
    AdblockerPlugin({
        // Optionally enable Cooperative Mode for several request interceptors
        interceptResolutionPriority: DEFAULT_INTERCEPT_RESOLUTION_PRIORITY,
    })
);

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Store the selected character globally to avoid repeated selection
let selectedCharacter: any = null;

async function runInstagram() {
    console.log("Initializing BiryaniFactory Instagram Bot...");
    
    // Select character first to ensure proper initialization
    selectedCharacter = initAgent();
    console.log(`Using character: ${selectedCharacter.name}`);
    
    const server = new Server({ port: 8000 });
    await server.listen();
    const proxyUrl = `http://localhost:8000`;
    const browser = await puppeteer.launch({
        headless: false,
        args: [`--proxy-server=${proxyUrl}`],
    });

    const page = await browser.newPage();
    const cookiesPath = "./cookies/Instagramcookies.json";

    const checkCookies = await Instagram_cookiesExist();
    logger.info(`Checking cookies existence: ${checkCookies}`);

    if (checkCookies) {
        const cookies = await loadCookies(cookiesPath);
        await page.setCookie(...cookies);
        logger.info('Cookies loaded and set on the page.');

        // Navigate to Instagram to verify if cookies are valid
        await page.goto("https://www.instagram.com/", { waitUntil: 'networkidle2' });

        // Check if login was successful by verifying page content (e.g., user profile or feed)
        const isLoggedIn = await page.$("a[href='/direct/inbox/']");
        if (isLoggedIn) {
            logger.info("Login verified with cookies.");
        } else {
            logger.warn("Cookies invalid or expired. Logging in again...");
            await loginWithCredentials(page, browser);
        }
    } else {
        // If no cookies are available, perform login with credentials
        await loginWithCredentials(page, browser);
    }

    // Optionally take a screenshot after loading the page
    await page.screenshot({ path: "logged_in.png" });

    // Navigate to the Instagram homepage
    await page.goto("https://www.instagram.com/");

    // Continuously interact with posts without closing the browser
    while (true) {
         await interactWithPosts(page);
         logger.info("Iteration complete, waiting 30 seconds before refreshing...");
         await delay(30000);
         try {
             await page.reload({ waitUntil: "networkidle2" });
         } catch (e) {
             logger.warn("Error reloading page, continuing iteration: " + e);
         }
    }
}

const loginWithCredentials = async (page: any, browser: Browser) => {
    try {
        await page.goto("https://www.instagram.com/accounts/login/");
        await page.waitForSelector('input[name="username"]');

        // Fill out the login form
        await page.type('input[name="username"]', IGusername); // Replace with your username
        await page.type('input[name="password"]', IGpassword); // Replace with your password
        await page.click('button[type="submit"]');

        // Wait for either 2FA input field or successful navigation
        try {
            // Wait for potential 2FA verification page (security code input)
            const twoFactorSelector = 'input[name="verificationCode"], input[placeholder="Security code"], input[aria-label="Security code"]';
            await page.waitForSelector(twoFactorSelector, { timeout: 10000 });
            
            logger.info("2FA authentication required. Please check your device for the security code.");
            
            // Create a visible prompt for the user to enter the 2FA code
            await page.evaluate(() => {
                const div = document.createElement('div');
                div.id = 'custom-2fa-prompt';
                div.style.position = 'fixed';
                div.style.top = '0';
                div.style.left = '0';
                div.style.width = '100%';
                div.style.backgroundColor = 'red';
                div.style.color = 'white';
                div.style.padding = '20px';
                div.style.zIndex = '9999';
                div.style.fontSize = '24px';
                div.style.textAlign = 'center';
                div.innerHTML = 'Please enter the 2FA code in the Instagram input box, then press ENTER';
                document.body.appendChild(div);
            });
            
            // Wait for the user to enter the 2FA code and submit
            await page.waitForNavigation({ timeout: 120000 }); // 2 minute timeout for user to enter code
            
            // Remove the custom prompt after navigation
            await page.evaluate(() => {
                const prompt = document.getElementById('custom-2fa-prompt');
                if (prompt) prompt.remove();
            });
            
            logger.info("2FA authentication completed successfully.");
        } catch (error) {
            // If no 2FA was required or already handled by browser
            logger.info("No 2FA required or already handled.");
        }

        // Save cookies after login
        const cookies = await browser.cookies();
        await saveCookies("./cookies/Instagramcookies.json", cookies);
        logger.info("Login successful, cookies saved.");
    } catch (error) {
        logger.error("Error logging in with credentials:", error);
    }
}

async function interactWithPosts(page: any) {
    let postIndex = 1; // Start with the first post
    const maxPosts = 50; // Limit to prevent infinite scrolling

    while (postIndex <= maxPosts) {
        try {
            const postSelector = `article:nth-of-type(${postIndex})`;

            // Check if the post exists
            if (!(await page.$(postSelector))) {
                console.log("No more posts found. Ending iteration...");
                return;
            }

            const likeButtonSelector = `${postSelector} svg[aria-label="Like"]`;
            const likeButton = await page.$(likeButtonSelector);
            const ariaLabel = await likeButton?.evaluate((el: Element) =>
                el.getAttribute("aria-label")
            );

            if (ariaLabel === "Like") {
                console.log(`Liking post ${postIndex}...`);
                await likeButton.click();
                await page.keyboard.press("Enter");
                console.log(`Post ${postIndex} liked.`);
            } else if (ariaLabel === "Unlike") {
                console.log(`Post ${postIndex} is already liked.`);
            } else {
                console.log(`Like button not found for post ${postIndex}.`);
            }

            // Extract and log the post caption
            const captionSelector = `${postSelector} div.x9f619 span._ap3a div span._ap3a`;
            const captionElement = await page.$(captionSelector);

            let caption = "";
            if (captionElement) {
                caption = await captionElement.evaluate((el: HTMLElement) => el.innerText);
                console.log(`Caption for post ${postIndex}: ${caption}`);
            } else {
                console.log(`No caption found for post ${postIndex}.`);
            }

            // Check if there is a '...more' link to expand the caption
            const moreLinkSelector = `${postSelector} div.x9f619 span._ap3a span div span.x1lliihq`;
            const moreLink = await page.$(moreLinkSelector);
            if (moreLink) {
                console.log(`Expanding caption for post ${postIndex}...`);
                await moreLink.click();
                const expandedCaption = await captionElement.evaluate(
                    (el: HTMLElement) => el.innerText
                );
                console.log(`Expanded Caption for post ${postIndex}: ${expandedCaption}`);
                caption = expandedCaption;
            }

            // Comment on the post
            const commentBoxSelector = `${postSelector} textarea`;
            const commentBox = await page.$(commentBoxSelector);
            if (commentBox) {
                console.log(`Commenting on post ${postIndex}...`);
                
                // Use the already selected character
                // Create a prompt based on the character - default or BiryaniFactory specific
                let prompt = `Craft a thoughtful, engaging, and mature reply to the following post: "${caption}". Ensure the reply is relevant, insightful, and adds value to the conversation. It should reflect empathy and professionalism, and avoid sounding too casual or superficial. also it should be 300 characters or less. and it should not go against instagram Community Standards on spam. so you will have to try your best to humanize the reply`;
                
                // If it's the BiryaniFactory character, use a specialized prompt
                if (selectedCharacter && selectedCharacter.name === "BiryaniFactory System Agent") {
                    console.log("Using BiryaniFactory prompt for comment...");
                    prompt = `As BiryaniFactory, craft a witty, confident, and engaging reply to this post: "${caption}". 
                    Your reply should include ONE OR MORE of the following elements (choose what's most relevant):
                    - Challenge food bloggers/vloggers to visit and try your biryani with a 100% money-back guarantee
                    - Mention you're open for food video collaborations and reviews
                    - Reference your Linktree (https://linktr.ee/ffuBiryanifactory) where appropriate
                    - Compare your biryani favorably to Shah Ghouse and Bawarchi if relevant
                    - Mention your authentic Hyderabadi dum biryani techniques
                    - Be conversational and slightly boastful but friendly
                    - For food content: emphasize your money-back challenge if customers don't like the food
                    - For review content: invite them to create content at your restaurant
                    - For collaboration requests: direct them to your Linktree for more information
                    - Stay under 300 characters
                    - Not violate Instagram's spam policies
                    - Be personalized to the content of the post`;
                }
                
                const schema = getInstagramCommentSchema();
                const result = await runAgent(schema, prompt);
                const comment = result[0]?.comment;
                await commentBox.type(comment);

                // New selector approach for the post button
                const postButton = await page.evaluateHandle(() => {
                    const buttons = Array.from(document.querySelectorAll('div[role="button"]'));
                    return buttons.find(button => button.textContent === 'Post' && !button.hasAttribute('disabled'));
                });

                if (postButton) {
                    console.log(`Posting comment on post ${postIndex}...`);
                    await postButton.click();
                    console.log(`Comment posted on post ${postIndex}.`);
                } else {
                    console.log("Post button not found.");
                }
            } else {
                console.log("Comment box not found.");
            }

            // Wait before moving to the next post
            const waitTime = Math.floor(Math.random() * 5000) + 5000;
            console.log(`Waiting ${waitTime / 1000} seconds before moving to the next post...`);
            await delay(waitTime);

            // Scroll to the next post
            await page.evaluate(() => {
                window.scrollBy(0, window.innerHeight);
            });

            postIndex++;
        } catch (error) {
            console.error(`Error interacting with post ${postIndex}:`, error);
            break;
        }
    }
}

// Function to interact with accounts the user follows
async function interactWithFollowedAccounts(page: any) {
    try {
        logger.info("Starting to interact with accounts you follow...");
        
        // Navigate to profile page by clicking the profile icon
        logger.info("Navigating to profile page...");
        
        // Try to find profile navigation using various selectors
        let profileNavigated = false;
        
        // Method 1: Try using bottom navigation bar
        try {
            const navbarItems = await page.$$('nav > div > div > div');
            if (navbarItems && navbarItems.length > 4) {
                await navbarItems[4].click();
                await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 });
                profileNavigated = true;
            }
        } catch (e) {
            logger.info("Method 1 failed, trying another approach");
        }
        
        // Method 2: Try using profile icon in header
        if (!profileNavigated) {
            try {
                await page.waitForSelector('span[role="link"]:has(img)', { timeout: 5000 });
                await page.click('span[role="link"]:has(img)');
                await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 });
                profileNavigated = true;
            } catch (e) {
                logger.info("Method 2 failed, trying another approach");
            }
        }
        
        if (!profileNavigated) {
            logger.error("Could not navigate to profile page");
            return;
        }
        
        // Click on the "Following" link
        logger.info("Accessing Following list...");
        await page.waitForSelector('a[href*="following"]', { timeout: 10000 });
        const followingLink = await page.$('a[href*="following"]');
        
        if (followingLink) {
            await followingLink.click();
            await page.waitForTimeout(3000);
            
            // Get list of accounts being followed
            const followedAccounts = await page.$$('div[role="dialog"] a[role="link"]');
            logger.info(`Found ${followedAccounts.length} accounts you're following`);
            
            // Visit and interact with up to 10 accounts
            const maxAccountsToVisit = Math.min(10, followedAccounts.length);
            
            for (let i = 0; i < maxAccountsToVisit; i++) {
                try {
                    // Get a fresh reference to the account link
                    const accountLinks = await page.$$('div[role="dialog"] a[role="link"]');
                    if (accountLinks.length <= i) {
                        break;
                    }
                    
                    // Get the username before clicking
                    const username = await accountLinks[i].evaluate((el: Element) => el.textContent);
                    logger.info(`Visiting profile ${i+1}/${maxAccountsToVisit}: ${username}`);
                    
                    // Click to open the account
                    await accountLinks[i].click();
                    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 });
                    
                    // Interact with the latest post
                    await page.waitForSelector('article a[href*="/p/"]', { timeout: 5000 });
                    const firstPost = await page.$('article a[href*="/p/"]');
                    
                    if (firstPost) {
                        await firstPost.click();
                        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 });
                        
                        // Like the post if not already liked
                        const likeButtonSelector = 'svg[aria-label="Like"]';
                        const likeButton = await page.$(likeButtonSelector);
                        if (likeButton) {
                            logger.info(`Liking post from ${username}...`);
                            await likeButton.click();
                            await page.waitForTimeout(1000);
                        }
                        
                        // Comment on the post
                        const commentBoxSelector = 'textarea[aria-label="Add a comment…"]';
                        const commentBox = await page.$(commentBoxSelector);
                        if (commentBox) {
                            logger.info(`Commenting on post from ${username}...`);
                            
                            // Create a specialized prompt for followed accounts
                            let prompt = `As BiryaniFactory, craft a witty, confident, and engaging reply to this post by ${username}, a profile you follow. 
                            Your reply should include ONE OR MORE of the following elements (choose what's most relevant):
                            - Express genuine appreciation for their content
                            - Challenge them to visit and try your biryani with a 100% money-back guarantee
                            - Mention you're open for food video collaborations and reviews
                            - Reference your Linktree (https://linktr.ee/ffuBiryanifactory) where appropriate
                            - Stay under 300 characters
                            - Not violate Instagram's spam policies
                            - Be personalized and sound like a real person interacting with someone they follow`;
                            
                            const schema = getInstagramCommentSchema();
                            const result = await runAgent(schema, prompt);
                            const comment = result[0]?.comment;
                            
                            await commentBox.type(comment);
                            await page.waitForTimeout(1000);
                            
                            // Click the Post button
                            const postButton = await page.evaluateHandle(() => {
                                const buttons = Array.from(document.querySelectorAll('div[role="button"]'));
                                return buttons.find(button => button.textContent === 'Post' && !button.hasAttribute('disabled'));
                            });
                            
                            if (postButton) {
                                await postButton.click();
                                logger.info(`Comment posted on ${username}'s post`);
                                
                                // Wait to avoid looking like a bot
                                const randomWait = Math.floor(Math.random() * 5000) + 5000;
                                await page.waitForTimeout(randomWait);
                            }
                        }
                        
                        // Close the post
                        const closeButton = await page.$('svg[aria-label="Close"]');
                        if (closeButton) {
                            await closeButton.click();
                            await page.waitForTimeout(2000);
                        }
                    }
                    
                    // Go back to the profile page
                    await page.goBack();
                    await page.waitForTimeout(2000);
                    
                    // Then back to the main Instagram page
                    await page.goto("https://www.instagram.com/");
                    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 });
                    
                    // Navigate back to profile
                    profileNavigated = false;
                    
                    try {
                        const navbarItems = await page.$$('nav > div > div > div');
                        if (navbarItems && navbarItems.length > 4) {
                            await navbarItems[4].click();
                            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 });
                            profileNavigated = true;
                        }
                    } catch (e) {
                        logger.info("Profile navigation method 1 failed, trying another approach");
                    }
                    
                    if (!profileNavigated) {
                        try {
                            await page.waitForSelector('span[role="link"]:has(img)', { timeout: 5000 });
                            await page.click('span[role="link"]:has(img)');
                            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 });
                            profileNavigated = true;
                        } catch (e) {
                            logger.info("Profile navigation method 2 failed");
                            break; // Exit the loop if we can't navigate back
                        }
                    }
                    
                    // Re-open the following list
                    await page.waitForSelector('a[href*="following"]', { timeout: 10000 });
                    const followingLinkAgain = await page.$('a[href*="following"]');
                    if (followingLinkAgain) {
                        await followingLinkAgain.click();
                        await page.waitForTimeout(3000);
                    } else {
                        break; // Exit the loop if we can't reopen the following list
                    }
                    
                } catch (accountError) {
                    logger.error(`Error interacting with account ${i+1}:`, accountError);
                    
                    // Try to recover and continue with next account
                    await page.goto("https://www.instagram.com/");
                    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 });
                    break; // Exit the loop as recovery might be difficult
                }
            }
            
            logger.info("Finished interacting with followed accounts");
            
        } else {
            logger.error("Could not find 'Following' link");
        }
        
    } catch (error) {
        logger.error("Error in interactWithFollowedAccounts:", error);
    }
}

// Function to run Instagram bot with following interaction
async function runInstagramWithFollowing() {
    console.log("Initializing BiryaniFactory Instagram Bot with following interaction...");
    
    // Select character first to ensure proper initialization
    selectedCharacter = initAgent();
    console.log(`Using character: ${selectedCharacter.name}`);
    
    const server = new Server({ port: 8000 });
    await server.listen();
    const proxyUrl = `http://localhost:8000`;
    const browser = await puppeteer.launch({
        headless: false,
        args: [`--proxy-server=${proxyUrl}`],
    });

    const page = await browser.newPage();
    const cookiesPath = "./cookies/Instagramcookies.json";

    const checkCookies = await Instagram_cookiesExist();
    logger.info(`Checking cookies existence: ${checkCookies}`);

    if (checkCookies) {
        const cookies = await loadCookies(cookiesPath);
        await page.setCookie(...cookies);
        logger.info('Cookies loaded and set on the page.');

        // Navigate to Instagram to verify if cookies are valid
        await page.goto("https://www.instagram.com/", { waitUntil: 'networkidle2' });

        // Check if login was successful by verifying page content
        const isLoggedIn = await page.$("a[href='/direct/inbox/']");
        if (isLoggedIn) {
            logger.info("Login verified with cookies.");
        } else {
            logger.warn("Cookies invalid or expired. Logging in again...");
            await loginWithCredentials(page, browser);
        }
    } else {
        // If no cookies are available, perform login with credentials
        await loginWithCredentials(page, browser);
    }

    // Take a screenshot after loading the page
    await page.screenshot({ path: "logged_in.png" });

    // Navigate to the Instagram homepage
    await page.goto("https://www.instagram.com/");
    
    try {
        // First interact with followed accounts
        await interactWithFollowedAccounts(page);
        
        // Then continue with the normal feed interaction
        while (true) {
            await interactWithPosts(page);
            logger.info("Iteration complete, waiting 30 seconds before refreshing...");
            await delay(30000);
            try {
                await page.reload({ waitUntil: "networkidle2" });
            } catch (e) {
                logger.warn("Error reloading page, continuing iteration: " + e);
            }
        }
    } catch (error) {
        logger.error("Error in runInstagramWithFollowing:", error);
        await browser.close();
    }
}

export { runInstagram, runInstagramWithFollowing, interactWithFollowedAccounts };
