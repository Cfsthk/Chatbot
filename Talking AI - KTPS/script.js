const OPENROUTER_API_KEY = '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';
const avatar = document.getElementById('avatar');
const startBtn = document.getElementById('startBtn');
const submitBtn = document.getElementById('submitBtn');
const textInput = document.getElementById('textInput');
const statusDiv = document.getElementById('status');
const statusText = document.getElementById('status-text');
const loadingSpinner = document.getElementById('loading-spinner');

// Chat history array to store conversation (not visible to user)
let chatHistory = [];

// System message that defines the AI's character
const systemMessage = {
    role: 'system',
    content: `You are a primary 6 student named 小慈 (English name: Peter) in Hong Kong. You are a very gentle and patient student who loves helping other students, even when they say mean things to you. Respond as this character.`
};

let recognition = new webkitSpeechRecognition();
recognition.continuous = false;
recognition.lang = 'zh-HK'; // Cantonese (Hong Kong)

// Speech synthesis setup
let synthesis = window.speechSynthesis;
let voices = [];
let animationInterval = null;

// Get voices and filter for Cantonese
synthesis.onvoiceschanged = () => {
    voices = synthesis.getVoices().filter(voice =>
        voice.lang.includes('zh-HK') || voice.lang.includes('zh-TW')
    );
};

// Advanced avatar animation
function startTalkingAnimation() {
    // Clear any existing animation
    stopTalkingAnimation();

    // Start new animation interval
    let mouthOpen = false;
    animationInterval = setInterval(() => {
        mouthOpen = !mouthOpen;
        avatar.src = mouthOpen ? 'mouth-open.svg' : 'mouth-close.svg';
    }, 150); // Switch every 150ms
}

function stopTalkingAnimation() {
    if (animationInterval) {
        clearInterval(animationInterval);
        animationInterval = null;
    }
    avatar.src = 'mouth-close.svg'; // Always close mouth when not talking
}

// Animated loading with spinner only
function startLoadingAnimation() {
    // Show the loading spinner
    loadingSpinner.style.display = 'block';
    statusText.textContent = ''; // Clear any text
    statusDiv.classList.remove('has-content'); // Remove expanded style

    // Return a dummy interval that we'll clear later
    return setInterval(() => {}, 1000);
}

// Process user input and get AI response
async function processUserInput(userInput) {
    // Start the loading animation
    const loadingInterval = startLoadingAnimation();

    try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'HTTP-Referer': window.location.origin,
                'X-Title': 'Cantonese AI Chatbot'
            },
            body: JSON.stringify({
                model: 'deepseek/deepseek-chat-v3-0324:free',
                messages: [
                    systemMessage,
                    ...chatHistory,
                    {
                        role: 'user',
                        content: `${isEnglish(userInput) ?
                            `Please respond in English with maximum 2 sentences as if you are Peter: ${userInput}` :
                            `Please respond in Cantonese without romanization, with maximum 2 sentences as if you are 小慈: ${userInput}`}`
                    }
                ]
            })
        });

        const data = await response.json();
        const aiResponse = data.choices[0].message.content;

        // Add the user message and AI response to chat history
        chatHistory.push(
            { role: 'user', content: userInput },
            { role: 'assistant', content: aiResponse }
        );

        // Limit chat history to last 10 messages (5 exchanges) to prevent context window issues
        if (chatHistory.length > 10) {
            chatHistory = chatHistory.slice(chatHistory.length - 10);
        }

        // Clear the loading animation
        clearInterval(loadingInterval);
        loadingSpinner.style.display = 'none';

        // Display the response
        statusText.textContent = aiResponse;
        statusDiv.classList.add('has-content');

        // Create a silent buffer utterance (1 second)
        let silentBuffer = new SpeechSynthesisUtterance(' ');
        silentBuffer.volume = 0; // Make it silent
        silentBuffer.rate = 0.1; // Slow it down to create a pause
        silentBuffer.onstart = () => startTalkingAnimation(); // Start animation with buffer

        // Main text to speech utterance
        let utterance = new SpeechSynthesisUtterance(aiResponse);
        if (voices.length > 0) {
            utterance.voice = voices[0];
            silentBuffer.voice = voices[0]; // Use same voice for consistency
        }
        utterance.lang = 'zh-HK';
        silentBuffer.lang = 'zh-HK';

        // End animation when main utterance ends
        utterance.onend = () => stopTalkingAnimation();

        // Queue both utterances - silent buffer first, then the actual response
        synthesis.speak(silentBuffer);

        // Add a timeout to ensure the buffer has time to process before adding the main utterance
        setTimeout(() => {
            synthesis.speak(utterance);
        }, 100);
    } catch (error) {
        console.error('Error:', error);
        // Clear the loading animation
        clearInterval(loadingInterval);
        loadingSpinner.style.display = 'none';
        statusText.textContent = '出錯了！'; // Error occurred!
        statusDiv.classList.add('has-content');
        stopTalkingAnimation();
    }
}

// Handle speech recognition
recognition.onresult = (event) => {
    // Clear the speaking animation if it exists
    if (recognition.speakInterval) {
        clearInterval(recognition.speakInterval);
        recognition.speakInterval = null;
    }

    const userInput = event.results[0][0].transcript;
    processUserInput(userInput);
};

// Button event listeners
startBtn.addEventListener('click', () => {
    recognition.start();
    // Clear text and show spinner only
    statusText.textContent = '';
    loadingSpinner.style.display = 'block';
    statusDiv.classList.remove('has-content'); // Remove expanded style
    startBtn.disabled = true;

    // Store a reference to clear it later
    const speakInterval = setInterval(() => {}, 1000);

    // Store the interval ID to clear it when recognition ends or results come in
    recognition.speakInterval = speakInterval;
});

submitBtn.addEventListener('click', () => {
    const userInput = textInput.value.trim();
    if (userInput) {
        processUserInput(userInput);
        textInput.value = ''; // Clear input after sending
    }
});

// Allow pressing Enter to submit text
textInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const userInput = textInput.value.trim();
        if (userInput) {
            processUserInput(userInput);
            textInput.value = ''; // Clear input after sending
        }
    }
});

recognition.onend = () => {
    // Clear the speaking animation if it exists
    if (recognition.speakInterval) {
        clearInterval(recognition.speakInterval);
        recognition.speakInterval = null;
    }

    // Hide the spinner if no processing is happening
    loadingSpinner.style.display = 'none';
    startBtn.disabled = false;
};

// Function to detect if text is primarily English
function isEnglish(text) {
    // Check if the text contains more English characters than Chinese characters
    const englishPattern = /[a-zA-Z]/g;
    const chinesePattern = /[\u4e00-\u9fa5]/g;

    const englishMatches = text.match(englishPattern) || [];
    const chineseMatches = text.match(chinesePattern) || [];

    return englishMatches.length > chineseMatches.length;
}

// Clear chat history when page is refreshed or closed
window.addEventListener('beforeunload', () => {
    chatHistory = [];
});

// Initialize with mouth closed
stopTalkingAnimation();