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
import { getInstagramCommentSchema, InstagramComment, FollowedAccount } from "../Agent/schema";
import { connectDB } from "../config/db";

// Add stealth plugin to puppeteer
puppeteer.use(StealthPlugin());
puppeteer.use(
    AdblockerPlugin({
        // Optionally enable Cooperative Mode for several request interceptors
        interceptResolutionPriority: DEFAULT_INTERCEPT_RESOLUTION_PRIORITY,
    })
);

// BiryaniFactory Linktree URL to include in comments
const LINKTREE_URL = "https://linktr.ee/ffuBiryanifactory";

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Store the selected character globally to avoid repeated selection
let selectedCharacter: any = null;

// List of popular food bloggers to follow
const FOOD_BLOGGERS = [
    'food_blogger_india',
    'thehungrymumbai',
    'hyderabadifoodies',
    'fooddudes_india',
    'thefoodietales',
    'delhi_food_nest',
    'mumbaifoodlovers',
    'hyderbadfoodiesclub',
    'bangalorefoodtalks',
    'delicious_india',
    // Hyderabad-specific food bloggers
    'hyderabadfoodie',
    'hyderabadruchi',
    'hyderbadi_zaika',
    'hyderabad_food_diaries',
    'hyderabadifoodlovers',
    // Competitor restaurants
    'shahghousehyderabad',
    'bawarchihyderabad',
    'paradisebiryanihyderabad',
    'cafebaharhyd',
    'shadabroyalhyderabad'
];

// Hashtags to explore for food content
const FOOD_HASHTAGS = [
    'hyderabadifood',
    'hyderabadibiryani',
    'biryanilovers',
    'hyderabadfoodies',
    'indianfood',
    'hyderabadicuisine',
    'dumbiryani',
    'hydculture',
    'bestbiryani'
];

// Track followed accounts to avoid repeated follow attempts
const followedAccounts = new Set<string>();

async function runInstagram() {
    console.log("Initializing BiryaniFactory Instagram Bot...");
    
    // Ensure database connection is established
    await connectDB();
    logger.info("Database connection established for Instagram Agent");
    
    // Load previously followed accounts from database
    try {
        const accounts = await FollowedAccount.find({});
        accounts.forEach(account => {
            followedAccounts.add(account.username);
        });
        logger.info(`Loaded ${followedAccounts.size} previously followed accounts from database`);
    } catch (error) {
        logger.error("Error loading followed accounts from database:", error);
    }
    
    // Select character first to ensure proper initialization
    selectedCharacter = initAgent();
    console.log(`Using character: ${selectedCharacter.name}`);
    
    const server = new Server({ port: 8000 });
    await server.listen();
    const proxyUrl = `http://localhost:8000`;
    const browser = await puppeteer.launch({
        headless: process.env.CI ? true : false, // Use headless in GitHub Actions
        args: [
            `--proxy-server=${proxyUrl}`,
            '--disable-features=site-per-process',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ],
        protocolTimeout: 120000, // Increase protocol timeout to 120 seconds
        defaultViewport: null
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

    // Counter for food blogger following
    let iterationCount = 0;
    
    // Flag to toggle between home feed and following feed
    let useFollowingFeed = false;
    
    // Continuously interact with posts without closing the browser
    while (true) {
         // Toggle between home feed and following feed (if available)
         if (iterationCount % 2 === 0) {
             useFollowingFeed = !useFollowingFeed;
             await switchFeed(page, useFollowingFeed);
         }
         
         await interactWithPosts(page);
         logger.info("Iteration complete, waiting 30 seconds before refreshing...");
         
         // Increment iteration counter
         iterationCount++;
         
         // Every 3 iterations, follow a food blogger
         if (iterationCount % 3 === 0) {
             logger.info("Following a food blogger account...");
             await followFoodBloggers(page);
         }
         
         // Every 5 iterations, explore hashtags to find new food-related accounts
         if (iterationCount % 5 === 0) {
             logger.info("Exploring hashtags to find new food-related accounts...");
             await exploreHashtags(page);
         }
         
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
            
            // Check if we're running in CI environment
            if (process.env.CI) {
                logger.error("2FA required in CI environment. Cannot proceed automatically.");
                logger.error("Please run the bot locally first to save cookies, then push the cookies to the repository.");
                process.exit(1);
            } else {
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
            }
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
    let commentsMade = 0; // Track number of comments made this session
    const maxComments = 10; // Limit comments per session to avoid spam detection

    // Add random delay before starting to simulate human behavior
    const initialDelay = Math.floor(Math.random() * 3000) + 2000;
    await delay(initialDelay);
    
    // Randomize the number of posts to interact with (between 5-15)
    // This makes our behavior less predictable and more human-like
    const randomMaxPosts = Math.floor(Math.random() * 10) + 5;
    logger.info(`Will interact with up to ${randomMaxPosts} posts in this session`);

    while (postIndex <= randomMaxPosts && commentsMade < maxComments) {
        try {
            const postSelector = `article:nth-of-type(${postIndex})`;

            // Check if the post exists with timeout
            let postExists = false;
            try {
                const post = await page.$(postSelector);
                postExists = !!post;
            } catch (error) {
                logger.warn(`Error checking if post ${postIndex} exists:`, error);
            }

            if (!postExists) {
                console.log("No more posts found. Ending iteration...");
                return;
            }

            // Extract username of the post author first to check if we follow them
            const usernameSelector = `${postSelector} a.x1i10hfl.xjbqb8w`;
            const usernameElement = await page.$(usernameSelector);
            
            let username = "";
            let isFollowedAccount = false;
            
            if (usernameElement) {
                try {
                    username = await usernameElement.evaluate((el: HTMLElement) => el.innerText);
                    isFollowedAccount = followedAccounts.has(username);
                    console.log(`Post ${postIndex} is from ${username} - Following: ${isFollowedAccount}`);
                } catch (error) {
                    logger.warn(`Error extracting username for post ${postIndex}:`, error);
                }
            }

            const likeButtonSelector = `${postSelector} svg[aria-label="Like"]`;
            let likeButton;
            let ariaLabel;
            
            try {
                likeButton = await page.$(likeButtonSelector);
                ariaLabel = likeButton ? await likeButton.evaluate((el: Element) => 
                    el.getAttribute("aria-label")
                ) : null;
            } catch (error) {
                logger.warn(`Error finding like button for post ${postIndex}:`, error);
                ariaLabel = null;
            }

            // Always like posts from accounts we follow, and occasionally like others
            const shouldLike = isFollowedAccount || (Math.random() < 0.6);
            
            if (ariaLabel === "Like" && shouldLike) {
                console.log(`Liking post ${postIndex}...`);
                try {
                    await likeButton.click();
                    await delay(500); // Add a small delay before pressing Enter
                    await page.keyboard.press("Enter");
                    console.log(`Post ${postIndex} liked.`);
                    
                    // Add random delay after liking to simulate human behavior
                    await delay(Math.floor(Math.random() * 1500) + 500);
                } catch (error) {
                    logger.warn(`Error liking post ${postIndex}:`, error);
                }
            } else if (ariaLabel === "Unlike") {
                console.log(`Post ${postIndex} is already liked.`);
            } else if (!shouldLike) {
                console.log(`Skipping like for post ${postIndex}.`);
            } else {
                console.log(`Like button not found for post ${postIndex}.`);
            }

            // Extract and log the post caption
            const captionSelector = `${postSelector} div.x9f619 span._ap3a div span._ap3a`;
            let captionElement;
            let caption = "";
            
            try {
                captionElement = await page.$(captionSelector);
                if (captionElement) {
                    caption = await captionElement.evaluate((el: HTMLElement) => el.innerText);
                    console.log(`Caption for post ${postIndex}: ${caption}`);
                } else {
                    console.log(`No caption found for post ${postIndex}.`);
                }
            } catch (error) {
                logger.warn(`Error extracting caption for post ${postIndex}:`, error);
            }

            // Check if there is a '...more' link to expand the caption
            try {
                const moreLinkSelector = `${postSelector} div.x9f619 span._ap3a span div span.x1lliihq`;
                const moreLink = await page.$(moreLinkSelector);
                if (moreLink) {
                    console.log(`Expanding caption for post ${postIndex}...`);
                    await moreLink.click();
                    await delay(1000); // Wait for caption to expand
                    
                    if (captionElement) {
                        const expandedCaption = await captionElement.evaluate(
                            (el: HTMLElement) => el.innerText
                        );
                        console.log(`Expanded Caption for post ${postIndex}: ${expandedCaption}`);
                        caption = expandedCaption;
                    }
                }
            } catch (error) {
                logger.warn(`Error expanding caption for post ${postIndex}:`, error);
            }

            // Only comment on posts from accounts we follow, or food-related content
            const isFoodRelated = caption.toLowerCase().includes('food') || 
                                 caption.toLowerCase().includes('biryani') || 
                                 caption.toLowerCase().includes('restaurant') ||
                                 caption.toLowerCase().includes('eat') ||
                                 caption.toLowerCase().includes('chef') ||
                                 caption.toLowerCase().includes('cuisine') ||
                                 caption.toLowerCase().includes('recipe') ||
                                 caption.toLowerCase().includes('delicious');
                                 
            const shouldComment = isFollowedAccount || isFoodRelated;

            // Comment on the post
            const commentBoxSelector = `${postSelector} textarea`;
            const commentBox = await page.$(commentBoxSelector);
            if (commentBox && shouldComment && commentsMade < maxComments) {
                console.log(`Commenting on post ${postIndex}...`);
                
                // Use the already selected character
                // Create a prompt based on the character - default or BiryaniFactory specific
                let prompt = `Craft a thoughtful, engaging, and mature reply to the following post: "${caption}". Ensure the reply is relevant, insightful, and adds value to the conversation. It should reflect empathy and professionalism, and avoid sounding too casual or superficial. also it should be 300 characters or less. and it should not go against instagram Community Standards on spam. so you will have to try your best to humanize the reply`;
                
                // If it's the BiryaniFactory character, use a specialized prompt
                if (selectedCharacter && selectedCharacter.name === "BiryaniFactory System Agent") {
                    console.log("Using BiryaniFactory prompt for comment...");
                    prompt = `As BiryaniFactory, craft a witty, confident, and engaging reply to this post: "${caption}". 
                    Your reply should:
                    - Challenge food bloggers/vloggers to visit and try your biryani
                    - Compare your biryani favorably to Shah Ghouse and Bawarchi if relevant
                    - Mention your authentic Hyderabadi dum biryani techniques
                    - Emphasize your 100% money-back guarantee if they don't love your biryani
                    - Invite food collaborations and honest reviews
                    - Be conversational and slightly boastful but friendly
                    - Include our Linktree URL: ${LINKTREE_URL} at the end of the comment
                    - Format the Linktree reference like "🔥 Try our biryani: ${LINKTREE_URL}"
                    - Stay under 300 characters including the Linktree URL
                    - Not violate Instagram's spam policies
                    - Be personalized to the content of the post`;
                    
                    // Add extra personalization for accounts we follow
                    if (isFollowedAccount) {
                        prompt += `\n- Show familiarity with ${username}'s content
                        - Mention that you're a fan of their posts
                        - Suggest a specific collaboration idea related to food content
                        - Invite them for a special tasting or review opportunity`;
                    }
                }
                
                const schema = getInstagramCommentSchema();
                const result = await runAgent(schema, prompt);
                const comment = result[0]?.comment;
                
                // Ensure the comment includes the Linktree URL
                let finalComment = comment;
                if (comment && !comment.includes(LINKTREE_URL)) {
                    // If Linktree URL isn't included, add it at the end
                    finalComment = `${comment.trim()}\n\n🔥 Try our biryani: ${LINKTREE_URL}`;
                    // Ensure it's not too long for Instagram
                    if (finalComment.length > 300) {
                        // Truncate the original comment to make space for the URL
                        const maxOriginalLength = 300 - (`\n\n🔥 Try our biryani: ${LINKTREE_URL}`.length);
                        finalComment = `${comment.substring(0, maxOriginalLength).trim()}\n\n🔥 Try our biryani: ${LINKTREE_URL}`;
                    }
                }
                
                await commentBox.type(finalComment);

                // New selector approach for the post button
                const postButton = await page.evaluateHandle(() => {
                    const buttons = Array.from(document.querySelectorAll('div[role="button"]'));
                    return buttons.find(button => button.textContent === 'Post' && !button.hasAttribute('disabled'));
                });

                if (postButton) {
                    console.log(`Posting comment on post ${postIndex}...`);
                    await postButton.click();
                    console.log(`Comment posted on post ${postIndex}.`);
                    commentsMade++; // Increment comment counter
                    
                    // Save comment to database
                    try {
                        // Extract post URL from the post
                        let postUrl = await page.url(); // Default to page URL
                        
                        // Try to find a link to the post within the article
                        const postLinkSelector = `${postSelector} a[href*="/p/"]`;
                        const postLinkElement = await page.$(postLinkSelector);
                        
                        if (postLinkElement) {
                            const href = await postLinkElement.evaluate((el: HTMLAnchorElement) => el.href);
                            if (href) {
                                postUrl = href; // Use the specific post URL
                            }
                        }
                        
                        // Create new comment document
                        const newComment = new InstagramComment({
                            postUrl,
                            comment: finalComment, // Use the finalized comment with Linktree URL
                            timeCommented: new Date(),
                            linktreeUrl: LINKTREE_URL
                        });
                        
                        // Save to database
                        await newComment.save();
                        logger.info(`Comment saved to database for post: ${postUrl}`);
                        
                        // If we commented on a post but aren't following the account yet, follow them
                        if (!isFollowedAccount) {
                            await followAccountOfPost(page, postSelector);
                        }
                    } catch (error) {
                        logger.error("Error saving comment to database:", error);
                    }
                } else {
                    console.log("Post button not found.");
                }
            } else if (!commentBox) {
                console.log("Comment box not found.");
            } else if (!shouldComment) {
                console.log(`Skipping comment for post ${postIndex} - Not from followed account or food-related.`);
            } else {
                console.log(`Reached maximum comments for this session (${maxComments}).`);
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

/**
 * Follows the account of a post that was commented on
 */
async function followAccountOfPost(page: any, postSelector: string) {
    try {
        // Find the username in the post
        const usernameSelector = `${postSelector} a.x1i10hfl.xjbqb8w`;
        const usernameElement = await page.$(usernameSelector);
        
        if (!usernameElement) {
            logger.info("Could not find username for post");
            return;
        }
        
        // Get the username text
        const username = await usernameElement.evaluate((el: HTMLElement) => el.innerText);
        
        // Skip if we've already followed this account
        if (followedAccounts.has(username)) {
            logger.info(`Already followed ${username}, skipping`);
            return;
        }

        // Instead of navigating to the profile (which may cause timeouts),
        // extract the href attribute from the username element
        const profileUrl = await usernameElement.evaluate((el: HTMLAnchorElement) => el.href);
        
        if (!profileUrl) {
            logger.info(`Could not extract profile URL for ${username}`);
            return;
        }
        
        // Limit follow attempts to avoid triggering Instagram's anti-automation measures
        // Only follow approximately 30% of accounts we comment on
        if (Math.random() > 0.3) {
            logger.info(`Randomly skipping follow for ${username} to avoid rate limiting`);
            // Still add to our followed accounts set to reduce future click attempts
            followedAccounts.add(username);
            return;
        }
        
        // Use direct navigation instead of clicking, with increased timeout and retry
        logger.info(`Navigating to profile: ${username}`);
        
        // Try to navigate to the profile with retries
        let profileLoaded = false;
        let retryCount = 0;
        const maxRetries = 2;
        
        while (!profileLoaded && retryCount < maxRetries) {
            try {
                // Use a longer timeout for profile navigation (45 seconds)
                await page.goto(profileUrl, { 
                    waitUntil: 'networkidle2',
                    timeout: 45000
                });
                profileLoaded = true;
            } catch (navError) {
                retryCount++;
                logger.warn(`Navigation retry ${retryCount}/${maxRetries} for ${username}: ${navError}`);
                await delay(3000); // Wait before retrying
            }
        }
        
        if (!profileLoaded) {
            logger.warn(`Could not load profile for ${username} after ${maxRetries} attempts`);
            // Return to feed and continue
            await page.goto("https://www.instagram.com/", { 
                waitUntil: 'networkidle2',
                timeout: 30000
            });
            return;
        }
        
        // Look for follow button with a shorter timeout
        const followButtonSelector = 'button:has-text("Follow")';
        const followButton = await page.$(followButtonSelector);
        
        if (followButton) {
            logger.info(`Following account: ${username}`);
            await followButton.click();
            followedAccounts.add(username);
            
            // Save to database
            try {
                const newFollowedAccount = new FollowedAccount({
                    username,
                    followedAt: new Date(),
                    accountType: 'post_author'
                });
                await newFollowedAccount.save();
                logger.info(`Saved followed account to database: ${username}`);
            } catch (error: any) {
                // If it's a duplicate key error, that's fine - we're already following
                if (error.code !== 11000) { // MongoDB duplicate key error code
                    logger.error(`Error saving followed account to database: ${error}`);
                }
            }
            
            // Add some delay after following
            await delay(Math.random() * 3000 + 2000);
        } else {
            logger.info(`Already following or cannot follow ${username}`);
        }
        
        // Go back to the feed with increased timeout
        logger.info("Returning to feed");
        await page.goto("https://www.instagram.com/", { 
            waitUntil: 'networkidle2',
            timeout: 30000
        });
    } catch (error) {
        logger.error("Error following account:", error);
        // Try to go back to the feed with increased timeout
        try {
            await page.goto("https://www.instagram.com/", { 
                waitUntil: 'networkidle2',
                timeout: 45000
            });
        } catch (e) {
            logger.error("Error returning to feed:", e);
            // Last resort: try to refresh the current page
            try {
                await page.reload({ waitUntil: 'networkidle2' });
            } catch (reloadError) {
                logger.error("Failed to reload page:", reloadError);
            }
        }
    }
}

/**
 * Searches for and follows food blogger accounts
 */
async function followFoodBloggers(page: any) {
    // Choose a random food blogger from the list
    const randomIndex = Math.floor(Math.random() * FOOD_BLOGGERS.length);
    const bloggerToFollow = FOOD_BLOGGERS[randomIndex];
    
    // Skip if already followed
    if (followedAccounts.has(bloggerToFollow)) {
        logger.info(`Already followed ${bloggerToFollow}, skipping`);
        return;
    }
    
    try {
        logger.info(`Searching for food blogger: ${bloggerToFollow}`);
        
        // Go to the search page
        await page.goto(`https://www.instagram.com/${bloggerToFollow}/`, { waitUntil: 'networkidle2' });
        
        // Look for follow button
        const followButtonSelector = 'button:has-text("Follow")';
        const followButton = await page.$(followButtonSelector);
        
        if (followButton) {
            logger.info(`Following food blogger: ${bloggerToFollow}`);
            await followButton.click();
            followedAccounts.add(bloggerToFollow);
            
            // Save to database
            try {
                const newFollowedAccount = new FollowedAccount({
                    username: bloggerToFollow,
                    followedAt: new Date(),
                    accountType: 'food_blogger'
                });
                await newFollowedAccount.save();
                logger.info(`Saved food blogger to database: ${bloggerToFollow}`);
            } catch (error: any) {
                // If it's a duplicate key error, that's fine - we're already following
                if (error.code !== 11000) {
                    logger.error(`Error saving food blogger to database: ${error}`);
                }
            }
            
            // Add some delay after following
            await delay(Math.random() * 3000 + 2000);
        } else {
            logger.info(`Already following or cannot follow ${bloggerToFollow}`);
        }
        
        // Return to the main feed
        await page.goto("https://www.instagram.com/", { waitUntil: 'networkidle2' });
    } catch (error) {
        logger.error(`Error following food blogger ${bloggerToFollow}:`, error);
        // Try to go back to the feed
        try {
            await page.goto("https://www.instagram.com/", { waitUntil: 'networkidle2' });
        } catch (e) {
            logger.error("Error returning to feed:", e);
        }
    }
}

/**
 * Explores hashtags to find and follow new food-related accounts
 */
async function exploreHashtags(page: any) {
    // Choose a random hashtag from the list
    const randomIndex = Math.floor(Math.random() * FOOD_HASHTAGS.length);
    const hashtagToExplore = FOOD_HASHTAGS[randomIndex];
    
    try {
        logger.info(`Exploring hashtag: #${hashtagToExplore}`);
        
        // Navigate to the hashtag page with improved timeout handling
        let hashtagLoaded = false;
        let retryCount = 0;
        const maxRetries = 2;
        
        while (!hashtagLoaded && retryCount < maxRetries) {
            try {
                await page.goto(`https://www.instagram.com/explore/tags/${hashtagToExplore}/`, { 
                    waitUntil: 'networkidle2',
                    timeout: 45000
                });
                hashtagLoaded = true;
            } catch (navError) {
                retryCount++;
                logger.warn(`Hashtag navigation retry ${retryCount}/${maxRetries}: ${navError}`);
                await delay(3000);
            }
        }
        
        if (!hashtagLoaded) {
            logger.warn(`Could not load hashtag page for #${hashtagToExplore} after ${maxRetries} attempts`);
            await safelyReturnToFeed(page);
            return;
        }
        
        // Wait for the posts to load
        await delay(3000);
        
        // Get the first few posts
        const postLinks = await page.$$('a[href*="/p/"]');
        
        // Randomly select one post from the first 9 posts (top posts)
        if (postLinks.length > 0) {
            const randomPostIndex = Math.floor(Math.random() * Math.min(9, postLinks.length));
            const randomPost = postLinks[randomPostIndex];
            
            // Get the href first, then navigate directly instead of clicking
            const postUrl = await randomPost.evaluate((el: HTMLAnchorElement) => el.href);
            
            if (!postUrl) {
                logger.info("Could not extract post URL");
                await safelyReturnToFeed(page);
                return;
            }
            
            // Navigate to the post with retry
            let postLoaded = false;
            retryCount = 0;
            
            while (!postLoaded && retryCount < maxRetries) {
                try {
                    await page.goto(postUrl, { 
                        waitUntil: 'networkidle2',
                        timeout: 45000
                    });
                    await page.waitForSelector('article[role="presentation"]', { timeout: 15000 });
                    postLoaded = true;
                } catch (navError) {
                    retryCount++;
                    logger.warn(`Post navigation retry ${retryCount}/${maxRetries}: ${navError}`);
                    await delay(3000);
                }
            }
            
            if (!postLoaded) {
                logger.warn(`Could not load post after ${maxRetries} attempts`);
                await safelyReturnToFeed(page);
                return;
            }
            
            // Get the username of the post author
            const usernameElement = await page.$('a.x1i10hfl.xjbqb8w');
            
            if (usernameElement) {
                const username = await usernameElement.evaluate((el: HTMLElement) => el.innerText);
                const profileUrl = await usernameElement.evaluate((el: HTMLAnchorElement) => el.href);
                
                // If we're not already following this account, follow it
                if (!followedAccounts.has(username) && profileUrl) {
                    logger.info(`Navigating to profile of ${username} from hashtag exploration`);
                    
                    // Navigate to profile with retry
                    let profileLoaded = false;
                    retryCount = 0;
                    
                    while (!profileLoaded && retryCount < maxRetries) {
                        try {
                            await page.goto(profileUrl, { 
                                waitUntil: 'networkidle2',
                                timeout: 45000
                            });
                            profileLoaded = true;
                        } catch (navError) {
                            retryCount++;
                            logger.warn(`Profile navigation retry ${retryCount}/${maxRetries}: ${navError}`);
                            await delay(3000);
                        }
                    }
                    
                    if (!profileLoaded) {
                        logger.warn(`Could not load profile for ${username} after ${maxRetries} attempts`);
                        await safelyReturnToFeed(page);
                        return;
                    }
                    
                    // Look for follow button
                    const followButtonSelector = 'button:has-text("Follow")';
                    const followButton = await page.$(followButtonSelector);
                    
                    if (followButton) {
                        logger.info(`Following account from hashtag exploration: ${username}`);
                        await followButton.click();
                        followedAccounts.add(username);
                        
                        // Save to database
                        try {
                            const newFollowedAccount = new FollowedAccount({
                                username,
                                followedAt: new Date(),
                                accountType: 'hashtag_discovery'
                            });
                            await newFollowedAccount.save();
                            logger.info(`Saved hashtag discovered account to database: ${username}`);
                        } catch (error: any) {
                            if (error.code !== 11000) {
                                logger.error(`Error saving hashtag discovered account to database: ${error}`);
                            }
                        }
                        
                        // Add some delay after following
                        await delay(Math.random() * 3000 + 2000);
                    } else {
                        logger.info(`Already following or cannot follow ${username}`);
                    }
                } else {
                    logger.info(`Already following ${username} or missing profile URL, skipping`);
                }
            }
        } else {
            logger.info(`No posts found for hashtag #${hashtagToExplore}`);
        }
        
        // Return to the main feed
        await safelyReturnToFeed(page);
    } catch (error) {
        logger.error(`Error exploring hashtag ${hashtagToExplore}:`, error);
        await safelyReturnToFeed(page);
    }
}

/**
 * Helper function to safely return to the Instagram feed
 */
async function safelyReturnToFeed(page: any) {
    try {
        logger.info("Safely returning to feed");
        let feedLoaded = false;
        let retryCount = 0;
        const maxRetries = 3;
        
        while (!feedLoaded && retryCount < maxRetries) {
            try {
                await page.goto("https://www.instagram.com/", { 
                    waitUntil: 'networkidle2',
                    timeout: 45000
                });
                feedLoaded = true;
            } catch (navError) {
                retryCount++;
                logger.warn(`Feed navigation retry ${retryCount}/${maxRetries}: ${navError}`);
                await delay(3000);
            }
        }
        
        if (!feedLoaded) {
            logger.warn(`Could not return to feed after ${maxRetries} attempts, trying page refresh`);
            try {
                await page.reload({ waitUntil: 'networkidle2' });
            } catch (reloadError) {
                logger.error("Failed to reload page:", reloadError);
            }
        }
    } catch (error) {
        logger.error("Error in safelyReturnToFeed:", error);
    }
}

/**
 * Switches between home feed and following feed
 */
async function switchFeed(page: any, useFollowingFeed: boolean) {
    try {
        // First check if the "Following" button exists
        const feedSwitcherSelector = 'span:has-text("Following")';
        const followingTabExists = await page.$(feedSwitcherSelector);
        
        if (followingTabExists && useFollowingFeed) {
            logger.info("Switching to Following feed");
            await followingTabExists.click();
            await delay(2000);
        } else if (!useFollowingFeed) {
            // Try to find the "For You" tab to switch back to home feed
            const forYouSelector = 'span:has-text("For You")';
            const forYouTab = await page.$(forYouSelector);
            
            if (forYouTab) {
                logger.info("Switching to For You feed");
                await forYouTab.click();
                await delay(2000);
            } else {
                // Alternatively, just go back to home page
                logger.info("Returning to home feed");
                await safelyReturnToFeed(page);
            }
        } else {
            logger.info("Following tab not found, staying on current feed");
        }
    } catch (error) {
        logger.error("Error switching feeds:", error);
        // In case of error, go back to home
        await safelyReturnToFeed(page);
    }
}

export { runInstagram };
