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

// Speech recognition variables
let recognition = null;
let recognitionActive = false;
let permissionGranted = false;

// Initialize speech recognition
function initSpeechRecognition() {
    recognition = new webkitSpeechRecognition();
    recognition.continuous = true; // Always set to continuous
    recognition.interimResults = false;
    recognition.lang = 'zh-HK'; // Cantonese (Hong Kong)

    // Set up recognition event handlers
    recognition.onresult = handleRecognitionResult;
    recognition.onend = handleRecognitionEnd;
    recognition.onerror = handleRecognitionError;
}

// Initialize recognition
initSpeechRecognition();

// Speech synthesis setup
let synthesis = window.speechSynthesis;
let voices = [];
let animationInterval = null;
let isRecording = false; // Track recording state

// Get available voices
synthesis.onvoiceschanged = () => {
    voices = synthesis.getVoices();
    console.log('Available voices:', voices);
};

// Initialize voices
getVoices();

// Function to get voices
function getVoices() {
    voices = synthesis.getVoices();
    console.log('Initial voices:', voices);
}

// Function to cancel all ongoing speech
function cancelSpeech() {
    // Cancel any ongoing speech
    synthesis.cancel();
    // Stop the talking animation
    stopTalkingAnimation();
    console.log('Speech canceled');
}

// Advanced avatar animation
function startTalkingAnimation() {
    // Clear any existing animation
    stopTalkingAnimation();

    // Start new animation interval
    let mouthOpen = false;
    animationInterval = setInterval(() => {
        mouthOpen = !mouthOpen;
        avatar.src = mouthOpen ? 'mouth-open.png' : 'mouth-close.png';
    }, 150); // Switch every 150ms
}

function stopTalkingAnimation() {
    if (animationInterval) {
        clearInterval(animationInterval);
        animationInterval = null;
    }
    avatar.src = 'mouth-close.png'; // Always close mouth when not talking
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
    // If we're in recording mode, temporarily pause recognition while the AI is speaking
    let wasRecording = false;
    if (recognitionActive) {
        wasRecording = true;
        try {
            recognition.stop();
        } catch (e) {
            console.error('Error stopping recognition during processing:', e);
        }
    }

    // Cancel any ongoing speech first
    cancelSpeech();

    // Check if the input is just numbers or contains numbers
    const isNumericInput = /^\d+(\.\d+)?$/.test(userInput.trim());
    const containsNumbers = /\d+(\.\d+)?/.test(userInput.trim());

    // If input is purely numeric, convert it to English words and speak it directly
    if (isNumericInput) {
        const numberInWords = numberToEnglish(parseFloat(userInput));

        // Display the response
        statusText.textContent = `${userInput} = ${numberInWords}`;
        statusDiv.classList.add('has-content');

        // Create utterance for the number
        let utterance = new SpeechSynthesisUtterance(numberInWords);
        utterance.lang = 'en-US';

        // Find an English voice
        if (voices.length > 0) {
            const englishVoice = voices.find(voice => voice.lang.includes('en'));
            utterance.voice = englishVoice || voices[0];
        }

        // Start animation and speak
        startTalkingAnimation();
        utterance.onend = () => stopTalkingAnimation();
        synthesis.speak(utterance);

        // Add to chat history
        chatHistory.push(
            { role: 'user', content: userInput },
            { role: 'assistant', content: numberInWords }
        );

        return; // Exit early, no need to call the API
    }
    // If the input contains numbers but also other text, proceed with API call
    else if (containsNumbers) {
        // Convert numbers to English words in the input
        userInput = convertNumbersInText(userInput);
    }

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

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'No error details available');
            console.error('API Error Response:', errorText);
            throw new Error(`API request failed with status ${response.status}: ${errorText}`);
        }

        const data = await response.json();

        // Check if the response has the expected structure
        if (!data || !data.choices || !data.choices[0] || !data.choices[0].message) {
            console.error('Unexpected API response structure:', data);
            throw new Error('Received an invalid response from the API');
        }

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

        // Check if the AI response contains numbers
        const containsNumbers = /\d+(\.\d+)?/.test(aiResponse);
        let processedResponse = aiResponse;

        // If the response contains numbers and is in English, convert them to words
        const isEnglishResponse = isEnglish(aiResponse);
        if (containsNumbers && isEnglishResponse) {
            processedResponse = convertNumbersInText(aiResponse);
        }

        // Main text to speech utterance
        let utterance = new SpeechSynthesisUtterance(processedResponse);

        // Set language based on input language
        utterance.lang = isEnglishResponse ? 'en-US' : 'zh-HK';
        silentBuffer.lang = utterance.lang;

        // Adjust voice to sound like a 10-year-old boy
        if (voices.length > 0) {
            // Try to find an appropriate voice
            let selectedVoice;

            if (isEnglishResponse) {
                // For English, prefer a young-sounding voice
                selectedVoice = voices.find(voice =>
                    voice.name.includes('Kid') ||
                    voice.name.includes('Child') ||
                    voice.name.includes('Boy')
                );

                // If no specific voice found, use any English voice
                if (!selectedVoice) {
                    selectedVoice = voices.find(voice =>
                        voice.lang.includes('en-US') ||
                        voice.lang.includes('en-GB') ||
                        voice.lang.includes('en')
                    );
                }
            } else {
                // For Cantonese, strictly use Hong Kong voice if available
                selectedVoice = voices.find(voice => voice.lang.includes('zh-HK'));

                // If no HK voice, try Taiwan as second choice (closer to Cantonese than Mandarin)
                if (!selectedVoice) {
                    selectedVoice = voices.find(voice => voice.lang.includes('zh-TW'));
                }
            }

            // If no specific voice found, use default
            utterance.voice = selectedVoice || voices[0];
            silentBuffer.voice = utterance.voice; // Use same voice for consistency

            console.log('Selected voice:', utterance.voice?.name);
        }

        // Adjust pitch and rate to sound younger
        utterance.pitch = 1.5;  // Higher pitch for younger voice
        utterance.rate = 1.25;  // Faster for more natural speech

        // End animation when main utterance ends and restart recording if needed
        utterance.onend = () => {
            stopTalkingAnimation();

            // If we were recording before, restart recording
            if (wasRecording && recognitionActive) {
                try {
                    console.log('Restarting recognition after speech');
                    recognition.start();
                    statusText.textContent = 'Listening...';
                    loadingSpinner.style.display = 'block';
                } catch (e) {
                    console.error('Error restarting recognition after speech:', e);
                    // If there's an error restarting, reset the recording state
                    recognitionActive = false;
                    startBtn.classList.remove('recording');
                    statusText.textContent = 'Recording stopped due to an error';
                }
            }
        };

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

        // Show a more helpful error message
        if (error.message.includes('API request failed')) {
            statusText.textContent = '連接伺服器時出錯！請稍後再試。'; // Error connecting to server
        } else if (error.message.includes('invalid response')) {
            statusText.textContent = '伺服器回應無效！請稍後再試。'; // Invalid server response
        } else {
            statusText.textContent = '出錯了！請稍後再試。'; // General error
        }

        statusDiv.classList.add('has-content');
        stopTalkingAnimation();
    }
}

// Handle speech recognition result
function handleRecognitionResult(event) {
    // Get the last result (most recent in continuous mode)
    const lastResultIndex = event.results.length - 1;
    const userInput = event.results[lastResultIndex][0].transcript;

    console.log('Speech recognized:', userInput);

    // Process the input
    processUserInput(userInput);
}

// Handle recognition ending
function handleRecognitionEnd() {
    console.log('Recognition ended, active status:', recognitionActive);

    // If we're still supposed to be recording but recognition ended
    // (can happen due to silence or network issues), restart it
    if (recognitionActive && permissionGranted) {
        try {
            console.log('Restarting recognition...');
            recognition.start();
        } catch (e) {
            console.error('Error restarting recognition:', e);
            handleRecognitionError(e);
        }
    } else {
        // Hide the spinner if no processing is happening
        loadingSpinner.style.display = 'none';
    }
}

// Handle recognition errors
function handleRecognitionError(event) {
    console.error('Recognition error:', event.error);

    // If there's a permission error, mark permission as not granted
    if (event.error === 'not-allowed' || event.error === 'permission-denied') {
        permissionGranted = false;
        recognitionActive = false;
        startBtn.classList.remove('recording');
        statusText.textContent = 'Microphone access denied';
        statusDiv.classList.add('has-content');
        loadingSpinner.style.display = 'none';
    } else if (recognitionActive) {
        // For other errors, try to restart if we're supposed to be active
        try {
            setTimeout(() => {
                if (recognitionActive) {
                    recognition.start();
                }
            }, 1000);
        } catch (e) {
            console.error('Failed to restart after error:', e);
            recognitionActive = false;
            startBtn.classList.remove('recording');
            statusText.textContent = 'Recording stopped due to an error';
            statusDiv.classList.add('has-content');
            loadingSpinner.style.display = 'none';
        }
    }
}

// Button event listeners
startBtn.addEventListener('click', () => {
    // Toggle recording state
    recognitionActive = !recognitionActive;

    if (recognitionActive) {
        // Start recording
        startBtn.classList.add('recording');

        // Cancel any ongoing speech first
        cancelSpeech();

        // Clear text and show spinner only
        statusText.textContent = 'Listening...';
        loadingSpinner.style.display = 'block';
        statusDiv.classList.add('has-content');

        // Start recognition
        try {
            recognition.start();
            permissionGranted = true; // If start() succeeds, permission is granted
        } catch (e) {
            console.error('Error starting recognition:', e);
            recognitionActive = false;
            startBtn.classList.remove('recording');
            statusText.textContent = 'Could not access microphone';
            statusDiv.classList.add('has-content');
        }
    } else {
        // Stop recording
        startBtn.classList.remove('recording');

        // Stop recognition
        try {
            recognition.stop();
        } catch (e) {
            console.error('Error stopping recognition:', e);
        }

        // Hide spinner
        loadingSpinner.style.display = 'none';
        statusText.textContent = '';
        statusDiv.classList.remove('has-content');
    }
});

submitBtn.addEventListener('click', () => {
    const userInput = textInput.value.trim();
    if (userInput) {
        // Cancel any ongoing speech first (processUserInput will also do this, but we do it here for immediate feedback)
        cancelSpeech();
        processUserInput(userInput);
        textInput.value = ''; // Clear input after sending
    }
});

// Allow pressing Enter to submit text
textInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const userInput = textInput.value.trim();
        if (userInput) {
            // Cancel any ongoing speech first (processUserInput will also do this, but we do it here for immediate feedback)
            cancelSpeech();
            processUserInput(userInput);
            textInput.value = ''; // Clear input after sending
        }
    }
});

// Function to detect if text is primarily English
function isEnglish(text) {
    // Check if the text contains more English characters than Chinese characters
    const englishPattern = /[a-zA-Z]/g;
    const chinesePattern = /[\u4e00-\u9fa5]/g;

    const englishMatches = text.match(englishPattern) || [];
    const chineseMatches = text.match(chinesePattern) || [];

    return englishMatches.length > chineseMatches.length;
}

// Function to convert a number to its English word representation
function numberToEnglish(num) {
    const units = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
    const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
    const scales = ['', 'thousand', 'million', 'billion', 'trillion'];

    // Handle negative numbers
    if (num < 0) {
        return 'negative ' + numberToEnglish(Math.abs(num));
    }

    // Handle zero
    if (num === 0) {
        return 'zero';
    }

    // Convert the number to a string
    let numStr = num.toString();

    // For decimal numbers
    if (numStr.includes('.')) {
        const parts = numStr.split('.');
        return numberToEnglish(parseInt(parts[0])) + ' point ' + parts[1].split('').map(digit => units[parseInt(digit)]).join(' ');
    }

    // Function to convert a 3-digit group
    function convertGroup(n) {
        let result = '';

        // Handle hundreds
        if (n >= 100) {
            result += units[Math.floor(n / 100)] + ' hundred ';
            n %= 100;
            if (n > 0) result += 'and ';
        }

        // Handle tens and units
        if (n > 0) {
            if (n < 20) {
                result += units[n];
            } else {
                result += tens[Math.floor(n / 10)];
                if (n % 10 > 0) {
                    result += '-' + units[n % 10];
                }
            }
        }

        return result;
    }

    // Split the number into groups of 3 digits
    let result = '';
    let groups = [];

    for (let i = numStr.length; i > 0; i -= 3) {
        groups.push(parseInt(numStr.substring(Math.max(0, i - 3), i)));
    }

    // Convert each group and add the appropriate scale
    for (let i = 0; i < groups.length; i++) {
        if (groups[i] !== 0) {
            result = convertGroup(groups[i]) + ' ' + scales[i] + ' ' + result;
        }
    }

    return result.trim();
}

// Function to detect and convert numbers in text
function convertNumbersInText(text) {
    // Find all numbers in the text
    const numberPattern = /\b\d+(\.\d+)?\b/g;
    const numbers = text.match(numberPattern) || [];

    // Replace each number with its English word representation
    let result = text;
    for (const num of numbers) {
        result = result.replace(num, numberToEnglish(parseFloat(num)));
    }

    return result;
}

// Clear chat history when page is refreshed or closed
window.addEventListener('beforeunload', () => {
    chatHistory = [];
});

// Initialize with mouth closed
stopTalkingAnimation();
