import { initAgent } from '../Agent';

console.log('Running character selection tool...');
console.log('This will switch the active character for your Instagram bot.');
console.log('---------------------------------------------------------');

// Run the character selection
const selectedCharacter = initAgent();
console.log(`\nSuccessfully selected: ${selectedCharacter.name}`);
console.log('You can now start the bot with this character by running:');
console.log('npm start'); 