const { runInstagram } = require('./src/client/Instagram');
const fs = require('fs');

// Create cookies directory if it doesn't exist
if (!fs.existsSync('./cookies')) {
  fs.mkdirSync('./cookies', { recursive: true });
}

// Get the run duration from environment variable (in minutes)
const runDuration = process.env.RUN_DURATION || 30;
const endTime = new Date(Date.now() + runDuration * 60 * 1000);

console.log(`BiryaniFactory Instagram Bot will run for ${runDuration} minutes, until ${endTime.toLocaleTimeString()}`);

// Start the bot with an exit handler
process.on('SIGINT', () => {
  console.log('Received interrupt signal, shutting down gracefully...');
  process.exit(0);
});

// Start the bot
runInstagram()
  .then(() => {
    console.log('Instagram bot started successfully');
  })
  .catch((err) => {
    console.error('Error starting Instagram bot:', err);
    process.exit(1);
  });

// Set a timer to stop the bot after the specified duration
setTimeout(() => {
  console.log(`Run duration of ${runDuration} minutes completed, shutting down...`);
  process.exit(0);
}, runDuration * 60 * 1000); 