# BiryaniFactory Instagram Bot GitHub Actions Setup

This guide will help you set up and run the BiryaniFactory Instagram bot using GitHub Actions. This setup allows you to run the bot on GitHub's servers with easy start/stop capabilities.

## Initial Setup

### 1. Add Secrets to Your Repository

1. Go to your repository on GitHub
2. Click on "Settings" > "Secrets and variables" > "Actions"
3. Add the following secrets:
   - `IG_USERNAME`: Your Instagram username
   - `IG_PASSWORD`: Your Instagram password

### 2. Generate Cookie Files Locally First

Before running in GitHub Actions, you should first run the bot locally to generate cookie files. This helps avoid 2FA issues in the automated environment:

1. Clone the repository to your local machine
2. Install dependencies: `npm install`
3. Run the bot locally: `node run-instagram.js`
4. Log in with your credentials and handle any 2FA challenges
5. After successful login, cookies will be saved in the `./cookies` directory
6. Commit and push the cookies directory to your repository (make sure it's not in .gitignore)

## Running the Bot

### Starting the Bot

1. Go to the "Actions" tab in your GitHub repository
2. Click on the "BiryaniFactory Instagram Bot" workflow
3. Click the "Run workflow" button
4. Enter the duration (in minutes) you want the bot to run (default is 30 minutes)
5. Click "Run workflow" again

### Monitoring the Bot

1. Click on the running workflow to see logs
2. You can view the bot's activity in real-time in the logs

### Stopping the Bot

1. If you need to stop the bot before its scheduled duration:
   - Go to the running workflow
   - Click the "Cancel workflow" button in the top-right corner

## Notes and Troubleshooting

- The bot runs in headless mode in GitHub Actions
- Each run is limited to a maximum of 6 hours (360 minutes)
- If you encounter login issues, try regenerating the cookies locally
- GitHub Actions has a monthly limit of free minutes (2000 minutes for free accounts)
- Instagram may detect automation, so use reasonably short durations (30-60 minutes) with breaks between runs

## Advanced Configuration

You can modify the `.github/workflows/instagram-bot.yml` file to:
- Change the default duration
- Add a schedule to run the bot at specific times
- Customize environment variables
- Add notifications for when the bot starts/stops

## Security Considerations

- Your Instagram credentials are stored securely in GitHub Secrets
- Cookie files are cached between runs for seamless operation
- Consider regenerating cookies periodically for security

For any issues or questions, please open an issue in the repository. 